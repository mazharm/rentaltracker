import { describe, it, expect } from 'vitest';
import { migrateProperty, migrateConfig, Property, Config } from '../types';

describe('migrateProperty', () => {
  it('migrates old monthlyRent to rentSchedule', () => {
    const oldProperty = {
      id: 'prop-1',
      name: 'Test',
      address: '123 Test St',
      monthlyRent: 2000,
      rentStartDate: '2025-03-01',
      propertyTax: { annualAmount: 5000, dueMonth: 4 },
      deposit: null,
      status: 'active' as const,
    } as unknown as Property;

    const migrated = migrateProperty(oldProperty);
    expect(migrated.rentSchedule).toEqual([{ startMonth: '2025-03', amount: 2000 }]);
    expect(migrated.propertyTax.annualAmounts).toEqual([{ year: 2025, amount: 5000 }]);
  });

  it('handles property with neither old nor new fields', () => {
    const bareProperty = {
      id: 'prop-1',
      name: 'Test',
      address: '123 Test St',
      rentStartDate: '2025-01-01',
      propertyTax: { dueMonth: 4 },
      deposit: null,
      status: 'active' as const,
    } as unknown as Property;

    const migrated = migrateProperty(bareProperty);
    expect(migrated.rentSchedule).toEqual([{ startMonth: '2025-01', amount: 0 }]);
    expect(migrated.propertyTax.annualAmounts).toEqual([{ year: 2025, amount: 0 }]);
    expect(migrated.propertyTax.dueMonth).toBe(4);
  });

  it('does not overwrite new schema fields', () => {
    const newProperty: Property = {
      id: 'prop-1',
      name: 'Test',
      address: '123 Test St',
      rentSchedule: [{ startMonth: '2025-01', amount: 1800 }],
      rentStartDate: '2025-01-01',
      propertyTax: { annualAmounts: [{ year: 2025, amount: 6000 }], dueMonth: 10 },
      deposit: null,
      status: 'active',
    };

    const migrated = migrateProperty(newProperty);
    expect(migrated.rentSchedule).toEqual([{ startMonth: '2025-01', amount: 1800 }]);
    expect(migrated.propertyTax.annualAmounts).toEqual([{ year: 2025, amount: 6000 }]);
  });
});

describe('migrateConfig', () => {
  it('migrates all properties in a config', () => {
    const oldConfig = {
      version: 1 as const,
      properties: [
        {
          id: 'a',
          name: 'A',
          address: 'Addr A',
          monthlyRent: 1500,
          rentStartDate: '2024-06-01',
          propertyTax: { annualAmount: 4000, dueMonth: 3 },
          deposit: null,
          status: 'active',
        },
      ],
      recurringExpenseTemplates: [],
    } as unknown as Config;

    const migrated = migrateConfig(oldConfig);
    expect(migrated.properties[0].rentSchedule).toEqual([{ startMonth: '2024-06', amount: 1500 }]);
    expect(migrated.properties[0].propertyTax.annualAmounts).toEqual([{ year: 2024, amount: 4000 }]);
  });
});
