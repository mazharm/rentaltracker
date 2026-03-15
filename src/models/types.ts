export interface Config {
  version: 1;
  properties: Property[];
  recurringExpenseTemplates: RecurringExpenseTemplate[];
}

export interface RentPeriod {
  startMonth: string; // 'YYYY-MM' format — when this rent amount takes effect
  amount: number;
}

export interface PropertyTaxYear {
  year: number;
  amount: number;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  rentSchedule: RentPeriod[]; // sorted by startMonth ascending
  rentStartDate: string;
  propertyTax: {
    annualAmounts: PropertyTaxYear[];
    dueMonth: number;
  };
  deposit: Deposit | null;
  status: 'active' | 'inactive';
}

export interface Deposit {
  amount: number;
  receivedDate: string;
  refundedDate?: string;
  refundAmount?: number;
}

export interface RecurringExpenseTemplate {
  id: string;
  name: string;
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  amount: number;
  appliesToPropertyIds: string[] | 'all';
  category: ExpenseCategory;
  startDate: string;
  endDate?: string;
}

export type ExpenseCategory =
  | 'landscaping'
  | 'roof_cleaning'
  | 'appliance_insurance'
  | 'property_insurance'
  | 'property_tax'
  | 'repairs_maintenance'
  | 'utilities'
  | 'management_fees'
  | 'legal_professional'
  | 'advertising'
  | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  landscaping: 'Landscaping',
  roof_cleaning: 'Roof Cleaning',
  appliance_insurance: 'Appliance Insurance',
  property_insurance: 'Property Insurance',
  property_tax: 'Property Tax',
  repairs_maintenance: 'Repairs & Maintenance',
  utilities: 'Utilities',
  management_fees: 'Management Fees',
  legal_professional: 'Legal & Professional',
  advertising: 'Advertising',
  other: 'Other',
};

export type RentStatus = 'accrued' | 'received' | 'vacant' | 'partial' | 'deposit_retained';

export interface YearData {
  version: 1;
  year: number;
  rentEntries: RentEntry[];
  expenseEntries: ExpenseEntry[];
}

export interface RentEntry {
  id: string;
  propertyId: string;
  month: number;
  year: number;
  expectedAmount: number;
  actualAmount: number;
  status: RentStatus;
  overrideReason?: string;
  receivedDate?: string;
  notes?: string;
}

export interface ExpenseEntry {
  id: string;
  propertyId: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  recurringTemplateId?: string;
  isOneTime: boolean;
  receipt?: {
    fileName: string;
    oneDrivePath: string;
  };
  notes?: string;
}

export interface ScheduleEReport {
  year: number;
  properties: ScheduleEPropertyReport[];
  totals: ScheduleELineItems;
}

export interface ScheduleEPropertyReport {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  lineItems: ScheduleELineItems;
  netIncome: number;
}

export interface ScheduleELineItems {
  rentsReceived: number;
  advertising: number;
  cleaningMaintenance: number;
  insurance: number;
  legalProfessional: number;
  managementFees: number;
  taxes: number;
  utilities: number;
  otherExpenses: number;
  totalExpenses: number;
}

// --- Sharing / Multi-account types ---

export type DataSource =
  | { type: 'own' }
  | { type: 'shared'; accountId: string; shareUrl: string; label: string };

export interface SharingConfig {
  version: 1;
  myShareLink: string | null;
  sharedAccounts: SharedAccount[];
}

export interface SharedAccount {
  id: string;
  label: string;
  shareUrl: string;
  addedAt: string;
}

/** Migrate old SharedAccount format (with driveId/itemId) to new (shareUrl only) */
export function migrateSharedAccount(account: SharedAccount): SharedAccount {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = account as any;
  return {
    id: account.id,
    label: account.label,
    shareUrl: legacy.shareUrl || '',
    addedAt: account.addedAt,
  };
}

export interface LinkedUsersFile {
  version: 1;
  users: LinkedUser[];
}

export interface LinkedUser {
  name: string;
  email: string;
  linkedAt: string;
}

export function createDefaultSharingConfig(): SharingConfig {
  return { version: 1, myShareLink: null, sharedAccounts: [] };
}

// --- Rent schedule helpers ---

/** Get the rent amount for a specific month from the schedule */
export function getRentForMonth(rentSchedule: RentPeriod[] | undefined, year: number, month: number): number {
  if (!rentSchedule || rentSchedule.length === 0) return 0;
  const targetMonth = `${year}-${String(month).padStart(2, '0')}`;
  let amount = 0;
  for (const period of rentSchedule) {
    if (period.startMonth <= targetMonth) {
      amount = period.amount;
    } else {
      break;
    }
  }
  return amount;
}

/** Get the property tax amount for a specific year */
export function getTaxForYear(annualAmounts: PropertyTaxYear[] | undefined, year: number): number {
  if (!annualAmounts || annualAmounts.length === 0) return 0;
  // Find exact year match, or fall back to the most recent year before it
  let amount = 0;
  for (const entry of annualAmounts) {
    if (entry.year <= year) {
      amount = entry.amount;
    }
  }
  return amount;
}

// --- Migration ---

/** Migrate a property from the old schema (monthlyRent, annualAmount) to the new one */
export function migrateProperty(property: Property): Property {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = property as any;
  let migrated = { ...property };

  // Ensure rentSchedule exists
  if (!migrated.rentSchedule) {
    const amount = legacy.monthlyRent ?? 0;
    const startMonth = migrated.rentStartDate
      ? migrated.rentStartDate.substring(0, 7)
      : `${new Date().getFullYear()}-01`;
    migrated.rentSchedule = [{ startMonth, amount }];
  }

  // Ensure propertyTax.annualAmounts exists
  if (!migrated.propertyTax) {
    migrated.propertyTax = { annualAmounts: [], dueMonth: 1 };
  }
  if (!migrated.propertyTax.annualAmounts) {
    const amount = legacy.propertyTax?.annualAmount ?? 0;
    const startYear = migrated.rentStartDate
      ? Number(migrated.rentStartDate.split('-')[0])
      : new Date().getFullYear();
    migrated.propertyTax = {
      ...migrated.propertyTax,
      annualAmounts: [{ year: startYear, amount }],
    };
  }

  return migrated;
}

/** Migrate all properties in a config loaded from storage */
export function migrateConfig(config: Config): Config {
  return {
    ...config,
    properties: config.properties.map(migrateProperty),
  };
}

// --- Helpers ---

export function createEmptyYearData(year: number): YearData {
  return { version: 1, year, rentEntries: [], expenseEntries: [] };
}

export function createDefaultConfig(): Config {
  return {
    version: 1,
    properties: [],
    recurringExpenseTemplates: [],
  };
}

export const DEFAULT_TEMPLATES: Omit<RecurringExpenseTemplate, 'id' | 'startDate'>[] = [
  { name: 'Landscaping', frequency: 'monthly', amount: 0, appliesToPropertyIds: 'all', category: 'landscaping' },
  { name: 'Roof Cleaning', frequency: 'annual', amount: 0, appliesToPropertyIds: 'all', category: 'roof_cleaning' },
  { name: 'Appliance Insurance', frequency: 'monthly', amount: 0, appliesToPropertyIds: 'all', category: 'appliance_insurance' },
  { name: 'Property Insurance', frequency: 'annual', amount: 0, appliesToPropertyIds: 'all', category: 'property_insurance' },
];
