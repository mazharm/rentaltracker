import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { AccountInfo } from '@azure/msal-browser';
import {
  Config,
  Property,
  YearData,
  RentEntry,
  ExpenseEntry,
  RecurringExpenseTemplate,
  ScheduleEReport,
  DataSource,
  SharingConfig,
  SharedAccount,
  LinkedUser,
  LinkedUsersFile,
  createDefaultConfig,
  createDefaultSharingConfig,
  createEmptyYearData,
  DEFAULT_TEMPLATES,
} from '../models/types';
import { readJsonFile, createShareLink as apiCreateShareLink } from '../api/onedrive';
import { writeWithArchive } from '../api/archive';
import { accrueRentForProperties } from '../engine/rentAccrual';
import { accrueExpensesForTemplates } from '../engine/expenseAccrual';
import { generateScheduleEReport } from '../engine/reportGenerator';

interface AppStore {
  // Auth
  isAuthenticated: boolean;
  user: AccountInfo | null;
  setAuth: (isAuthenticated: boolean, user: AccountInfo | null) => void;

  // Data
  config: Config | null;
  yearData: Record<number, YearData>;
  currentYear: number;
  configETag: string | null;
  yearETags: Record<number, string | null>;

  // Sharing / Multi-account
  activeDataSource: DataSource;
  sharingConfig: SharingConfig;
  linkedUsers: LinkedUser[];
  setActiveDataSource: (source: DataSource) => Promise<void>;
  addSharedAccount: (label: string, sharingUrl: string) => Promise<void>;
  removeSharedAccount: (id: string) => Promise<void>;
  createShareLink: () => Promise<string>;
  loadSharingConfig: () => Promise<void>;
  saveSharingConfig: () => Promise<void>;
  loadLinkedUsers: () => Promise<void>;
  registerAsLinkedUser: (source: DataSource) => Promise<void>;

  // UI
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  error: string | null;
  clearError: () => void;

  // Actions — Data loading & sync
  loadFromOneDrive: () => Promise<void>;
  saveConfig: () => Promise<void>;
  saveYearData: (year: number) => Promise<void>;
  syncAfterConfigChange: () => Promise<void>;

  // Actions — Properties
  addProperty: (property: Omit<Property, 'id'>) => void;
  updateProperty: (id: string, updates: Partial<Property>) => void;
  deactivateProperty: (id: string) => void;

  // Actions — Templates
  addTemplate: (template: Omit<RecurringExpenseTemplate, 'id'>) => void;
  updateTemplate: (id: string, updates: Partial<RecurringExpenseTemplate>) => void;
  deleteTemplate: (id: string) => void;

  // Actions — Income
  accrueRent: () => void;
  overrideRent: (propertyId: string, month: number, year: number, override: Partial<RentEntry>) => void;
  retainDeposit: (propertyId: string, retainedAmount: number, month: number, year: number) => void;

  // Actions — Expenses
  accrueExpenses: () => void;
  addExpense: (entry: Omit<ExpenseEntry, 'id'>) => void;
  deleteExpense: (id: string, year: number) => void;

  // Actions — Reports
  generateReport: (year: number) => ScheduleEReport;
}

export const useStore = create<AppStore>((set, get) => ({
  // Auth
  isAuthenticated: false,
  user: null,
  setAuth: (isAuthenticated, user) => set({ isAuthenticated, user }),

  // Data
  config: null,
  yearData: {},
  currentYear: new Date().getFullYear(),
  configETag: null,
  yearETags: {},

  // Sharing
  activeDataSource: { type: 'own' },
  sharingConfig: createDefaultSharingConfig(),
  linkedUsers: [],

  // UI
  isLoading: false,
  isSyncing: false,
  lastSyncTime: null,
  error: null,
  clearError: () => set({ error: null }),

  // --- Sharing actions ---

  loadSharingConfig: async () => {
    // Always read from own approot — sharing config is per-user
    const result = await readJsonFile<SharingConfig>('sharing.json', { type: 'own' });
    if (result) {
      set({ sharingConfig: result.data });
    }
    // Also load linked users (people who have accepted your share link)
    await get().loadLinkedUsers();
  },

  saveSharingConfig: async () => {
    const { sharingConfig } = get();
    await writeWithArchive('sharing.json', sharingConfig, undefined, { type: 'own' });
  },

  setActiveDataSource: async (source) => {
    set({ activeDataSource: source });
    await get().loadFromOneDrive();
  },

  addSharedAccount: async (label, sharingUrl) => {
    const { sharingConfig } = get();
    const newAccount: SharedAccount = {
      id: uuidv4(),
      label,
      sharingUrl,
      addedAt: new Date().toISOString(),
    };
    set({
      sharingConfig: {
        ...sharingConfig,
        sharedAccounts: [...sharingConfig.sharedAccounts, newAccount],
      },
    });
    await get().saveSharingConfig();
  },

  removeSharedAccount: async (id) => {
    const { sharingConfig, activeDataSource } = get();
    set({
      sharingConfig: {
        ...sharingConfig,
        sharedAccounts: sharingConfig.sharedAccounts.filter((a) => a.id !== id),
      },
    });
    // If the removed account was active, switch back to own
    if (activeDataSource.type === 'shared' && activeDataSource.accountId === id) {
      set({ activeDataSource: { type: 'own' } });
      await get().loadFromOneDrive();
    }
    await get().saveSharingConfig();
  },

  createShareLink: async () => {
    const link = await apiCreateShareLink();
    const { sharingConfig } = get();
    set({ sharingConfig: { ...sharingConfig, myShareLink: link } });
    await get().saveSharingConfig();
    // Return the app invite URL, not the raw OneDrive link
    return `${window.location.origin}/rentaltracker/#/share?link=${encodeURIComponent(link)}`;
  },

  loadLinkedUsers: async () => {
    // Read linked_users.json from own approot to see who has linked
    const result = await readJsonFile<LinkedUsersFile>('linked_users.json', { type: 'own' });
    if (result) {
      set({ linkedUsers: result.data.users });
    } else {
      set({ linkedUsers: [] });
    }
  },

  registerAsLinkedUser: async (source: DataSource) => {
    // Write this user's info into the owner's linked_users.json via the share link
    if (source.type !== 'shared') return;
    const { user } = get();
    if (!user) return;

    const existing = await readJsonFile<LinkedUsersFile>('linked_users.json', source);
    const users: LinkedUser[] = existing?.data.users ?? [];

    const email = user.username || '';
    // Don't add duplicates
    if (users.some((u) => u.email === email)) return;

    users.push({
      name: user.name || email,
      email,
      linkedAt: new Date().toISOString(),
    });

    const file: LinkedUsersFile = { version: 1, users };
    await writeWithArchive('linked_users.json', file, existing?.eTag, source);
  },

  // --- Data loading ---

  loadFromOneDrive: async () => {
    const { activeDataSource } = get();
    set({ isLoading: true, error: null });
    try {
      // Load config from the active data source
      const configResult = await readJsonFile<Config>('config.json', activeDataSource);
      let config: Config;
      let configETag: string | null = null;

      if (configResult) {
        config = configResult.data;
        configETag = configResult.eTag;
      } else if (activeDataSource.type === 'own') {
        // First run — create default config with seed templates (own data only)
        config = createDefaultConfig();
        const today = new Date().toISOString().split('T')[0];
        config.recurringExpenseTemplates = DEFAULT_TEMPLATES.map((t) => ({
          ...t,
          id: uuidv4(),
          startDate: today,
        }));
        await writeWithArchive('config.json', config, undefined, activeDataSource);
      } else {
        throw new Error('Shared account has no data. The owner may not have set up their account yet.');
      }

      // Load current year data
      const currentYear = new Date().getFullYear();
      const yearData: Record<number, YearData> = {};
      const yearETags: Record<number, string | null> = {};

      for (const year of [currentYear - 1, currentYear]) {
        const result = await readJsonFile<YearData>(`data/${year}.json`, activeDataSource);
        if (result) {
          yearData[year] = result.data;
          yearETags[year] = result.eTag;
        } else {
          yearData[year] = createEmptyYearData(year);
          yearETags[year] = null;
        }
      }

      set({ config, configETag, yearData, yearETags, currentYear, lastSyncTime: new Date() });

      // Cache in sessionStorage
      try {
        sessionStorage.setItem('rt_config', JSON.stringify(config));
        sessionStorage.setItem('rt_yearData', JSON.stringify(yearData));
      } catch {
        // sessionStorage might be full or unavailable
      }

      // Run accrual engines
      get().accrueRent();
      get().accrueExpenses();
    } catch (e) {
      // Try to load from sessionStorage cache
      try {
        const cachedConfig = sessionStorage.getItem('rt_config');
        const cachedYearData = sessionStorage.getItem('rt_yearData');
        if (cachedConfig && cachedYearData) {
          set({
            config: JSON.parse(cachedConfig),
            yearData: JSON.parse(cachedYearData),
            error: `Failed to load from OneDrive (using cached data): ${e instanceof Error ? e.message : String(e)}`,
          });
          return;
        }
      } catch {
        // Cache load failed too
      }
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  saveConfig: async () => {
    const { config, configETag, activeDataSource } = get();
    if (!config) return;

    set({ isSyncing: true, error: null });
    try {
      const newETag = await writeWithArchive('config.json', config, configETag, activeDataSource);
      set({ configETag: newETag, lastSyncTime: new Date() });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      set({ isSyncing: false });
    }
  },

  saveYearData: async (year: number) => {
    const { yearData, yearETags, activeDataSource } = get();
    const data = yearData[year];
    if (!data) return;

    set({ isSyncing: true, error: null });
    try {
      const newETag = await writeWithArchive(`data/${year}.json`, data, yearETags[year], activeDataSource);
      set({
        yearETags: { ...yearETags, [year]: newETag },
        lastSyncTime: new Date(),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      set({ isSyncing: false });
    }
  },

  syncAfterConfigChange: async () => {
    const store = get();
    await store.saveConfig();
    store.accrueRent();
    store.accrueExpenses();
    const { yearData } = get();
    for (const yearStr of Object.keys(yearData)) {
      await store.saveYearData(Number(yearStr));
    }
  },

  // Properties
  addProperty: (property) => {
    const { config } = get();
    if (!config) return;
    const newProperty: Property = { ...property, id: uuidv4() };
    set({ config: { ...config, properties: [...config.properties, newProperty] } });
  },

  updateProperty: (id, updates) => {
    const { config } = get();
    if (!config) return;
    set({
      config: { ...config, properties: config.properties.map((p) => (p.id === id ? { ...p, ...updates } : p)) },
    });
  },

  deactivateProperty: (id) => {
    const { config } = get();
    if (!config) return;
    set({
      config: { ...config, properties: config.properties.map((p) => (p.id === id ? { ...p, status: 'inactive' as const } : p)) },
    });
  },

  // Templates
  addTemplate: (template) => {
    const { config } = get();
    if (!config) return;
    const newTemplate: RecurringExpenseTemplate = { ...template, id: uuidv4() };
    set({
      config: { ...config, recurringExpenseTemplates: [...config.recurringExpenseTemplates, newTemplate] },
    });
  },

  updateTemplate: (id, updates) => {
    const { config } = get();
    if (!config) return;
    set({
      config: {
        ...config,
        recurringExpenseTemplates: config.recurringExpenseTemplates.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      },
    });
  },

  deleteTemplate: (id) => {
    const { config } = get();
    if (!config) return;
    set({
      config: { ...config, recurringExpenseTemplates: config.recurringExpenseTemplates.filter((t) => t.id !== id) },
    });
  },

  // Income
  accrueRent: () => {
    const { config, yearData } = get();
    if (!config) return;
    set({ yearData: accrueRentForProperties(config.properties, yearData) });
  },

  overrideRent: (propertyId, month, year, override) => {
    const { yearData } = get();
    const data = yearData[year];
    if (!data) return;
    set({
      yearData: {
        ...yearData,
        [year]: {
          ...data,
          rentEntries: data.rentEntries.map((e) =>
            e.propertyId === propertyId && e.month === month && e.year === year ? { ...e, ...override } : e
          ),
        },
      },
    });
  },

  retainDeposit: (propertyId, retainedAmount, month, year) => {
    const { config, yearData } = get();
    if (!config) return;
    const property = config.properties.find((p) => p.id === propertyId);
    if (!property) return;
    const data = yearData[year] || createEmptyYearData(year);
    set({
      yearData: {
        ...yearData,
        [year]: {
          ...data,
          rentEntries: [...data.rentEntries, {
            id: uuidv4(),
            propertyId,
            month,
            year,
            expectedAmount: 0,
            actualAmount: retainedAmount,
            status: 'deposit_retained' as const,
            notes: `Deposit retained — ${property.name}`,
          }],
        },
      },
    });
  },

  // Expenses
  accrueExpenses: () => {
    const { config, yearData } = get();
    if (!config) return;
    set({ yearData: accrueExpensesForTemplates(config.recurringExpenseTemplates, config.properties, yearData) });
  },

  addExpense: (entry) => {
    const year = new Date(entry.date).getFullYear();
    const { yearData } = get();
    const data = yearData[year] || createEmptyYearData(year);
    set({
      yearData: {
        ...yearData,
        [year]: { ...data, expenseEntries: [...data.expenseEntries, { ...entry, id: uuidv4() }] },
      },
    });
  },

  deleteExpense: (id, year) => {
    const { yearData } = get();
    const data = yearData[year];
    if (!data) return;
    set({
      yearData: {
        ...yearData,
        [year]: { ...data, expenseEntries: data.expenseEntries.filter((e) => e.id !== id) },
      },
    });
  },

  // Reports
  generateReport: (year: number) => {
    const { yearData, config } = get();
    return generateScheduleEReport(year, yearData[year], config?.properties ?? []);
  },
}));
