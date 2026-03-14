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
  createDefaultConfig,
  createEmptyYearData,
  DEFAULT_TEMPLATES,
} from '../models/types';
import { readJsonFile } from '../api/onedrive';
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

  // UI
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  error: string | null;
  clearError: () => void;

  // Actions — Data loading
  loadFromOneDrive: () => Promise<void>;
  saveConfig: () => Promise<void>;
  saveYearData: (year: number) => Promise<void>;

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

  // UI
  isLoading: false,
  isSyncing: false,
  lastSyncTime: null,
  error: null,
  clearError: () => set({ error: null }),

  // Actions — Data loading
  loadFromOneDrive: async () => {
    set({ isLoading: true, error: null });
    try {
      // Load config
      const configResult = await readJsonFile<Config>('config.json');
      let config: Config;
      let configETag: string | null = null;

      if (configResult) {
        config = configResult.data;
        configETag = configResult.eTag;
      } else {
        // First run — create default config with seed templates
        config = createDefaultConfig();
        const today = new Date().toISOString().split('T')[0];
        config.recurringExpenseTemplates = DEFAULT_TEMPLATES.map((t) => ({
          ...t,
          id: uuidv4(),
          startDate: today,
        }));
        await writeWithArchive('config.json', config);
      }

      // Load current year data
      const currentYear = new Date().getFullYear();
      const yearData: Record<number, YearData> = {};
      const yearETags: Record<number, string | null> = {};

      // Load current and previous year
      for (const year of [currentYear - 1, currentYear]) {
        const result = await readJsonFile<YearData>(`data/${year}.json`);
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
    const { config, configETag } = get();
    if (!config) return;

    set({ isSyncing: true, error: null });
    try {
      const newETag = await writeWithArchive('config.json', config, configETag);
      set({ configETag: newETag, lastSyncTime: new Date() });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      set({ isSyncing: false });
    }
  },

  saveYearData: async (year: number) => {
    const { yearData, yearETags } = get();
    const data = yearData[year];
    if (!data) return;

    set({ isSyncing: true, error: null });
    try {
      const newETag = await writeWithArchive(`data/${year}.json`, data, yearETags[year]);
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

  // Properties
  addProperty: (property) => {
    const { config } = get();
    if (!config) return;
    const newProperty: Property = { ...property, id: uuidv4() };
    set({
      config: { ...config, properties: [...config.properties, newProperty] },
    });
  },

  updateProperty: (id, updates) => {
    const { config } = get();
    if (!config) return;
    set({
      config: {
        ...config,
        properties: config.properties.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      },
    });
  },

  deactivateProperty: (id) => {
    const { config } = get();
    if (!config) return;
    set({
      config: {
        ...config,
        properties: config.properties.map((p) => (p.id === id ? { ...p, status: 'inactive' as const } : p)),
      },
    });
  },

  // Templates
  addTemplate: (template) => {
    const { config } = get();
    if (!config) return;
    const newTemplate: RecurringExpenseTemplate = { ...template, id: uuidv4() };
    set({
      config: {
        ...config,
        recurringExpenseTemplates: [...config.recurringExpenseTemplates, newTemplate],
      },
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
      config: {
        ...config,
        recurringExpenseTemplates: config.recurringExpenseTemplates.filter((t) => t.id !== id),
      },
    });
  },

  // Income
  accrueRent: () => {
    const { config, yearData } = get();
    if (!config) return;
    const updated = accrueRentForProperties(config.properties, yearData);
    set({ yearData: updated });
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
            e.propertyId === propertyId && e.month === month && e.year === year
              ? { ...e, ...override }
              : e
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

    // Add synthetic rent entry
    const syntheticEntry: RentEntry = {
      id: uuidv4(),
      propertyId,
      month,
      year,
      expectedAmount: 0,
      actualAmount: retainedAmount,
      status: 'deposit_retained',
      notes: `Deposit retained — ${property.name}`,
    };

    set({
      yearData: {
        ...yearData,
        [year]: {
          ...data,
          rentEntries: [...data.rentEntries, syntheticEntry],
        },
      },
    });
  },

  // Expenses
  accrueExpenses: () => {
    const { config, yearData } = get();
    if (!config) return;
    const updated = accrueExpensesForTemplates(
      config.recurringExpenseTemplates,
      config.properties,
      yearData
    );
    set({ yearData: updated });
  },

  addExpense: (entry) => {
    const year = new Date(entry.date).getFullYear();
    const { yearData } = get();
    const data = yearData[year] || createEmptyYearData(year);

    const newEntry: ExpenseEntry = { ...entry, id: uuidv4() };

    set({
      yearData: {
        ...yearData,
        [year]: {
          ...data,
          expenseEntries: [...data.expenseEntries, newEntry],
        },
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
        [year]: {
          ...data,
          expenseEntries: data.expenseEntries.filter((e) => e.id !== id),
        },
      },
    });
  },

  // Reports
  generateReport: (year: number) => {
    const { yearData, config } = get();
    return generateScheduleEReport(year, yearData[year], config?.properties ?? []);
  },
}));
