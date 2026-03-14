import { describe, it, expect } from 'vitest';
import { accrueExpensesForTemplates } from '../expenseAccrual';
import { Property, RecurringExpenseTemplate } from '../../models/types';

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

function makeTemplate(overrides: Partial<RecurringExpenseTemplate> = {}): RecurringExpenseTemplate {
  return {
    id: 'tmpl-1',
    name: 'Landscaping',
    frequency: 'monthly',
    amount: 150,
    appliesToPropertyIds: 'all',
    category: 'landscaping',
    startDate: '2025-01-01',
    ...overrides,
  };
}

describe('accrueExpensesForTemplates', () => {
  it('generates monthly expenses', () => {
    const template = makeTemplate({ frequency: 'monthly', startDate: '2025-01-01' });
    const property = makeProperty();
    const result = accrueExpensesForTemplates([template], [property], {}, new Date('2025-04-15'));

    const entries = result[2025].expenseEntries.filter((e) => e.recurringTemplateId === 'tmpl-1');
    expect(entries).toHaveLength(4); // Jan–Apr
    expect(entries[0].date).toBe('2025-01-01');
    expect(entries[0].amount).toBe(150);
    expect(entries[0].isOneTime).toBe(false);
  });

  it('generates quarterly expenses', () => {
    const template = makeTemplate({ frequency: 'quarterly', startDate: '2025-01-01' });
    const property = makeProperty();
    const result = accrueExpensesForTemplates([template], [property], {}, new Date('2025-12-31'));

    const entries = result[2025].expenseEntries.filter((e) => e.recurringTemplateId === 'tmpl-1');
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.date)).toEqual([
      '2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01',
    ]);
  });

  it('generates annual expenses on anniversary', () => {
    const template = makeTemplate({ frequency: 'annual', startDate: '2025-06-15' });
    const property = makeProperty();
    const result = accrueExpensesForTemplates([template], [property], {}, new Date('2027-07-01'));

    const allEntries = Object.values(result).flatMap((yd) =>
      yd.expenseEntries.filter((e) => e.recurringTemplateId === 'tmpl-1')
    );
    expect(allEntries).toHaveLength(3); // 2025-06-15, 2026-06-15, 2027-06-15
  });

  it('respects appliesToPropertyIds', () => {
    const template = makeTemplate({ appliesToPropertyIds: ['prop-2'] });
    const properties = [makeProperty({ id: 'prop-1' }), makeProperty({ id: 'prop-2' })];
    const result = accrueExpensesForTemplates([template], properties, {}, new Date('2025-03-15'));

    const entries = result[2025].expenseEntries.filter((e) => e.recurringTemplateId === 'tmpl-1');
    expect(entries.every((e) => e.propertyId === 'prop-2')).toBe(true);
  });

  it('does not duplicate existing entries', () => {
    const template = makeTemplate();
    const property = makeProperty();
    const existing = accrueExpensesForTemplates([template], [property], {}, new Date('2025-02-15'));
    const result = accrueExpensesForTemplates([template], [property], existing, new Date('2025-04-15'));

    const entries = result[2025].expenseEntries.filter((e) => e.recurringTemplateId === 'tmpl-1');
    expect(entries).toHaveLength(4); // not 6 (2 existing + 4 new)
  });

  it('generates property tax entries', () => {
    const property = makeProperty({ propertyTax: { annualAmount: 6000, dueMonth: 10 } });
    const result = accrueExpensesForTemplates([], [property], {}, new Date('2025-06-15'));

    const taxEntries = result[2025].expenseEntries.filter((e) => e.category === 'property_tax');
    expect(taxEntries).toHaveLength(1);
    expect(taxEntries[0].date).toBe('2025-10-01');
    expect(taxEntries[0].amount).toBe(6000);
    expect(taxEntries[0].description).toBe('Property tax — Test Property');
    expect(taxEntries[0].isOneTime).toBe(false);
  });

  it('skips property tax for zero amount', () => {
    const property = makeProperty({ propertyTax: { annualAmount: 0, dueMonth: 4 } });
    const result = accrueExpensesForTemplates([], [property], {}, new Date('2025-06-15'));

    const taxEntries = result[2025]?.expenseEntries.filter((e) => e.category === 'property_tax') ?? [];
    expect(taxEntries).toHaveLength(0);
  });

  it('skips inactive properties for templates and tax', () => {
    const template = makeTemplate();
    const property = makeProperty({ status: 'inactive' });
    const result = accrueExpensesForTemplates([template], [property], {}, new Date('2025-06-15'));

    // No expense entries should be generated for inactive properties
    const allExpenses = Object.values(result).flatMap((yd) => yd.expenseEntries);
    expect(allExpenses).toHaveLength(0);
  });
});
