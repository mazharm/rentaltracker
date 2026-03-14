import { v4 as uuidv4 } from 'uuid';
import { Property, RecurringExpenseTemplate, YearData } from '../models/types';

/** Parse 'YYYY-MM-DD' without timezone shift */
function parseLocalDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

/** Create a local-timezone Date from components */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function accrueExpensesForTemplates(
  templates: RecurringExpenseTemplate[],
  properties: Property[],
  yearDataMap: Record<number, YearData>,
  currentDate: Date = new Date()
): Record<number, YearData> {
  const updated = { ...yearDataMap };

  for (const template of templates) {
    const activeProperties = getApplicableProperties(template, properties);
    const dueDates = generateDueDates(template, currentDate);

    for (const { year, month, day } of dueDates) {
      if (!updated[year]) {
        updated[year] = { version: 1, year, rentEntries: [], expenseEntries: [] };
      }

      const dateStr = formatDate(year, month, day);

      for (const property of activeProperties) {
        const exists = updated[year].expenseEntries.some(
          (e) => e.recurringTemplateId === template.id && e.propertyId === property.id && e.date === dateStr
        );
        if (!exists) {
          updated[year].expenseEntries.push({
            id: uuidv4(),
            propertyId: property.id,
            date: dateStr,
            amount: template.amount,
            category: template.category,
            description: template.name,
            recurringTemplateId: template.id,
            isOneTime: false,
          });
        }
      }
    }
  }

  // Generate property tax entries
  for (const property of properties) {
    if (property.status !== 'active') continue;
    if (property.propertyTax.annualAmount === 0) continue;

    const startYear = parseLocalDate(property.rentStartDate).year;
    const currentYear = currentDate.getFullYear();

    for (let year = startYear; year <= currentYear; year++) {
      if (!updated[year]) {
        updated[year] = { version: 1, year, rentEntries: [], expenseEntries: [] };
      }

      const exists = updated[year].expenseEntries.some(
        (e) => e.propertyId === property.id && e.category === 'property_tax' && e.date.startsWith(`${year}-`)
      );

      if (!exists) {
        updated[year].expenseEntries.push({
          id: uuidv4(),
          propertyId: property.id,
          date: formatDate(year, property.propertyTax.dueMonth, 1),
          amount: property.propertyTax.annualAmount,
          category: 'property_tax',
          description: `Property tax — ${property.name}`,
          isOneTime: false,
        });
      }
    }
  }

  return updated;
}

function getApplicableProperties(template: RecurringExpenseTemplate, properties: Property[]): Property[] {
  const active = properties.filter((p) => p.status === 'active');
  if (template.appliesToPropertyIds === 'all') return active;
  return active.filter((p) => (template.appliesToPropertyIds as string[]).includes(p.id));
}

interface DateComponents {
  year: number;
  month: number; // 1-12
  day: number;
}

function generateDueDates(template: RecurringExpenseTemplate, currentDate: Date): DateComponents[] {
  const dates: DateComponents[] = [];
  const start = parseLocalDate(template.startDate);
  const endDate = template.endDate ? parseLocalDate(template.endDate) : null;
  const endLocal = endDate ? localDate(endDate.year, endDate.month, endDate.day) : currentDate;

  switch (template.frequency) {
    case 'monthly': {
      let y = start.year;
      let m = start.month;
      while (localDate(y, m, 1) <= endLocal) {
        dates.push({ year: y, month: m, day: 1 });
        m++;
        if (m > 12) { m = 1; y++; }
      }
      break;
    }
    case 'quarterly': {
      const quarterMonths = [1, 4, 7, 10];
      let year = start.year;
      outer1: while (true) {
        for (const m of quarterMonths) {
          const d = localDate(year, m, 1);
          if (d > endLocal) break outer1;
          if (d >= localDate(start.year, start.month, start.day)) {
            dates.push({ year, month: m, day: 1 });
          }
        }
        year++;
      }
      break;
    }
    case 'semi-annual': {
      const semiMonths = [1, 7];
      let year = start.year;
      outer2: while (true) {
        for (const m of semiMonths) {
          const d = localDate(year, m, 1);
          if (d > endLocal) break outer2;
          if (d >= localDate(start.year, start.month, start.day)) {
            dates.push({ year, month: m, day: 1 });
          }
        }
        year++;
      }
      break;
    }
    case 'annual': {
      let year = start.year;
      while (localDate(year, start.month, start.day) <= endLocal) {
        dates.push({ year, month: start.month, day: start.day });
        year++;
      }
      break;
    }
  }

  return dates;
}
