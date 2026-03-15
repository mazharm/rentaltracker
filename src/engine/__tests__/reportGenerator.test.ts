import { describe, it, expect } from 'vitest';
import { generateScheduleEReport, generateCSV } from '../reportGenerator';
import { Property, YearData } from '../../models/types';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    name: '123 Elm St',
    address: '123 Elm St, Kirkland WA',
    rentSchedule: [{ startMonth: '2025-01', amount: 2000 }],
    rentStartDate: '2025-01-01',
    propertyTax: { annualAmounts: [{ year: 2025, amount: 5000 }], dueMonth: 4 },
    deposit: null,
    status: 'active',
    ...overrides,
  };
}

describe('generateScheduleEReport', () => {
  it('computes rents received excluding vacant months', () => {
    const yearData: YearData = {
      version: 1,
      year: 2025,
      rentEntries: [
        { id: '1', propertyId: 'prop-1', month: 1, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'received' },
        { id: '2', propertyId: 'prop-1', month: 2, year: 2025, expectedAmount: 2000, actualAmount: 0, status: 'vacant' },
        { id: '3', propertyId: 'prop-1', month: 3, year: 2025, expectedAmount: 2000, actualAmount: 1500, status: 'partial' },
      ],
      expenseEntries: [],
    };

    const report = generateScheduleEReport(2025, yearData, [makeProperty()]);
    expect(report.properties[0].lineItems.rentsReceived).toBe(3500); // 2000 + 0 (skipped) + 1500
  });

  it('includes deposit_retained in rents received', () => {
    const yearData: YearData = {
      version: 1,
      year: 2025,
      rentEntries: [
        { id: '1', propertyId: 'prop-1', month: 1, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'received' },
        { id: '2', propertyId: 'prop-1', month: 6, year: 2025, expectedAmount: 0, actualAmount: 500, status: 'deposit_retained' },
      ],
      expenseEntries: [],
    };

    const report = generateScheduleEReport(2025, yearData, [makeProperty()]);
    expect(report.properties[0].lineItems.rentsReceived).toBe(2500);
  });

  it('maps expense categories to correct Schedule E lines', () => {
    const yearData: YearData = {
      version: 1,
      year: 2025,
      rentEntries: [],
      expenseEntries: [
        { id: '1', propertyId: 'prop-1', date: '2025-01-15', amount: 100, category: 'advertising', description: 'Ad', isOneTime: true },
        { id: '2', propertyId: 'prop-1', date: '2025-02-01', amount: 200, category: 'landscaping', description: 'Lawn', isOneTime: false },
        { id: '3', propertyId: 'prop-1', date: '2025-02-01', amount: 300, category: 'repairs_maintenance', description: 'Fix', isOneTime: true },
        { id: '4', propertyId: 'prop-1', date: '2025-03-01', amount: 400, category: 'property_insurance', description: 'Ins', isOneTime: false },
        { id: '5', propertyId: 'prop-1', date: '2025-04-01', amount: 5000, category: 'property_tax', description: 'Tax', isOneTime: false },
        { id: '6', propertyId: 'prop-1', date: '2025-05-01', amount: 50, category: 'utilities', description: 'Water', isOneTime: true },
        { id: '7', propertyId: 'prop-1', date: '2025-06-01', amount: 75, category: 'management_fees', description: 'Mgmt', isOneTime: false },
        { id: '8', propertyId: 'prop-1', date: '2025-07-01', amount: 1000, category: 'legal_professional', description: 'Legal', isOneTime: true },
        { id: '9', propertyId: 'prop-1', date: '2025-08-01', amount: 25, category: 'other', description: 'Misc', isOneTime: true },
      ],
    };

    const report = generateScheduleEReport(2025, yearData, [makeProperty()]);
    const items = report.properties[0].lineItems;

    expect(items.advertising).toBe(100);
    expect(items.cleaningMaintenance).toBe(500); // landscaping 200 + repairs 300
    expect(items.insurance).toBe(400);
    expect(items.taxes).toBe(5000);
    expect(items.utilities).toBe(50);
    expect(items.managementFees).toBe(75);
    expect(items.legalProfessional).toBe(1000);
    expect(items.otherExpenses).toBe(25);
    expect(items.totalExpenses).toBe(7150);
  });

  it('computes net income correctly', () => {
    const yearData: YearData = {
      version: 1,
      year: 2025,
      rentEntries: [
        { id: '1', propertyId: 'prop-1', month: 1, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'received' },
      ],
      expenseEntries: [
        { id: '2', propertyId: 'prop-1', date: '2025-01-15', amount: 500, category: 'repairs_maintenance', description: 'Fix', isOneTime: true },
      ],
    };

    const report = generateScheduleEReport(2025, yearData, [makeProperty()]);
    expect(report.properties[0].netIncome).toBe(1500);
  });

  it('aggregates totals across properties', () => {
    const properties = [
      makeProperty({ id: 'a', name: 'Prop A' }),
      makeProperty({ id: 'b', name: 'Prop B' }),
    ];
    const yearData: YearData = {
      version: 1,
      year: 2025,
      rentEntries: [
        { id: '1', propertyId: 'a', month: 1, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'received' },
        { id: '2', propertyId: 'b', month: 1, year: 2025, expectedAmount: 3000, actualAmount: 3000, status: 'received' },
      ],
      expenseEntries: [],
    };

    const report = generateScheduleEReport(2025, yearData, properties);
    expect(report.totals.rentsReceived).toBe(5000);
  });

  it('handles empty year data', () => {
    const report = generateScheduleEReport(2025, undefined, [makeProperty()]);
    expect(report.properties[0].lineItems.rentsReceived).toBe(0);
    expect(report.properties[0].netIncome).toBe(0);
  });
});

describe('generateCSV', () => {
  it('produces valid CSV output', () => {
    const yearData: YearData = {
      version: 1,
      year: 2025,
      rentEntries: [
        { id: '1', propertyId: 'prop-1', month: 1, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'received' },
      ],
      expenseEntries: [
        { id: '2', propertyId: 'prop-1', date: '2025-01-15', amount: 100, category: 'advertising', description: 'Ad', isOneTime: true },
      ],
    };

    const report = generateScheduleEReport(2025, yearData, [makeProperty()]);
    const csv = generateCSV(report);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Property,Address,Line,Description,Amount');
    expect(lines[1]).toContain('"123 Elm St"');
    expect(lines[1]).toContain('"3"');
    expect(lines[1]).toContain('2000.00');

    // Line 5 = Advertising
    const adLine = lines.find((l) => l.includes('"5"'));
    expect(adLine).toContain('100.00');
  });
});
