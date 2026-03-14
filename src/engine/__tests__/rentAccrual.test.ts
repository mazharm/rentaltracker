import { describe, it, expect } from 'vitest';
import { accrueRentForProperties, updateRentForPropertyChange } from '../rentAccrual';
import { Property, YearData } from '../../models/types';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    name: 'Test Property',
    address: '123 Test St',
    monthlyRent: 2000,
    rentStartDate: '2025-01-01',
    propertyTax: { annualAmount: 5000, dueMonth: 4 },
    deposit: null,
    status: 'active',
    ...overrides,
  };
}

describe('accrueRentForProperties', () => {
  it('generates rent entries from start date to current month', () => {
    const property = makeProperty({ rentStartDate: '2025-03-01' });
    const result = accrueRentForProperties([property], {}, new Date('2025-06-15'));

    const entries = result[2025].rentEntries;
    expect(entries).toHaveLength(4); // Mar, Apr, May, Jun
    expect(entries[0].month).toBe(3);
    expect(entries[3].month).toBe(6);
    expect(entries[0].expectedAmount).toBe(2000);
    expect(entries[0].actualAmount).toBe(2000);
    expect(entries[0].status).toBe('accrued');
  });

  it('does not duplicate existing entries', () => {
    const property = makeProperty({ rentStartDate: '2025-01-01' });
    const existing: Record<number, YearData> = {
      2025: {
        version: 1,
        year: 2025,
        rentEntries: [
          {
            id: 'existing-1',
            propertyId: 'prop-1',
            month: 1,
            year: 2025,
            expectedAmount: 2000,
            actualAmount: 2000,
            status: 'received',
          },
        ],
        expenseEntries: [],
      },
    };

    const result = accrueRentForProperties([property], existing, new Date('2025-03-15'));
    const entries = result[2025].rentEntries;
    expect(entries).toHaveLength(3); // existing Jan + new Feb, Mar
    expect(entries[0].id).toBe('existing-1'); // original preserved
    expect(entries[0].status).toBe('received'); // status preserved
  });

  it('skips inactive properties', () => {
    const property = makeProperty({ status: 'inactive' });
    const result = accrueRentForProperties([property], {}, new Date('2025-06-15'));
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('handles cross-year accrual', () => {
    const property = makeProperty({ rentStartDate: '2025-11-01' });
    const result = accrueRentForProperties([property], {}, new Date('2026-02-15'));

    expect(result[2025].rentEntries).toHaveLength(2); // Nov, Dec
    expect(result[2026].rentEntries).toHaveLength(2); // Jan, Feb
  });

  it('handles multiple properties', () => {
    const props = [
      makeProperty({ id: 'a', rentStartDate: '2025-01-01' }),
      makeProperty({ id: 'b', rentStartDate: '2025-03-01' }),
    ];
    const result = accrueRentForProperties(props, {}, new Date('2025-04-15'));

    const entries = result[2025].rentEntries;
    expect(entries.filter((e) => e.propertyId === 'a')).toHaveLength(4);
    expect(entries.filter((e) => e.propertyId === 'b')).toHaveLength(2);
  });
});

describe('updateRentForPropertyChange', () => {
  it('updates future unmodified entries when rent changes', () => {
    const property = makeProperty({ monthlyRent: 2500 });
    const yearData: Record<number, YearData> = {
      2025: {
        version: 1,
        year: 2025,
        rentEntries: [
          { id: '1', propertyId: 'prop-1', month: 1, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'received' },
          { id: '2', propertyId: 'prop-1', month: 2, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'accrued' },
          { id: '3', propertyId: 'prop-1', month: 6, year: 2025, expectedAmount: 2000, actualAmount: 2000, status: 'accrued' },
          { id: '4', propertyId: 'prop-1', month: 8, year: 2025, expectedAmount: 2000, actualAmount: 1500, status: 'partial' },
        ],
        expenseEntries: [],
      },
    };

    const result = updateRentForPropertyChange(property, yearData, new Date('2025-03-15'));
    const entries = result[2025].rentEntries;

    // Jan: received (modified) — not updated
    expect(entries[0].expectedAmount).toBe(2000);
    // Feb: accrued but past — not updated
    expect(entries[1].expectedAmount).toBe(2000);
    // Jun: accrued and future — updated
    expect(entries[2].expectedAmount).toBe(2500);
    expect(entries[2].actualAmount).toBe(2500);
    // Aug: partial (modified) — not updated
    expect(entries[3].expectedAmount).toBe(2000);
    expect(entries[3].actualAmount).toBe(1500);
  });
});
