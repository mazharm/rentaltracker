import { v4 as uuidv4 } from 'uuid';
import { Property, YearData, getRentForMonth } from '../models/types';

export function accrueRentForProperties(
  properties: Property[],
  yearDataMap: Record<number, YearData>,
  currentDate: Date = new Date()
): Record<number, YearData> {
  const updated = { ...yearDataMap };
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  for (const property of properties) {
    if (property.status !== 'active') continue;

    const [startYear, startMonth] = property.rentStartDate.split('-').map(Number);

    for (let year = startYear; year <= currentYear; year++) {
      const monthStart = year === startYear ? startMonth : 1;
      const monthEnd = year === currentYear ? currentMonth : 12;

      if (!updated[year]) {
        updated[year] = { version: 1, year, rentEntries: [], expenseEntries: [] };
      }

      const yearData = updated[year];

      for (let month = monthStart; month <= monthEnd; month++) {
        const exists = yearData.rentEntries.some(
          (e) => e.propertyId === property.id && e.month === month && e.year === year
        );
        if (!exists) {
          const rentAmount = getRentForMonth(property.rentSchedule, year, month);
          yearData.rentEntries.push({
            id: uuidv4(),
            propertyId: property.id,
            month,
            year,
            expectedAmount: rentAmount,
            actualAmount: rentAmount,
            status: 'accrued',
          });
        }
      }
    }
  }

  return updated;
}

export function updateRentForPropertyChange(
  property: Property,
  yearDataMap: Record<number, YearData>,
  currentDate: Date = new Date()
): Record<number, YearData> {
  const updated = { ...yearDataMap };
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  for (const yearStr of Object.keys(updated)) {
    const year = Number(yearStr);
    const yearData = updated[year];

    yearData.rentEntries = yearData.rentEntries.map((entry) => {
      if (entry.propertyId !== property.id) return entry;

      // Only update future unmodified entries
      const isFuture = entry.year > currentYear || (entry.year === currentYear && entry.month > currentMonth);
      const isUnmodified = entry.status === 'accrued' && entry.actualAmount === entry.expectedAmount;

      if (isFuture && isUnmodified) {
        const rentAmount = getRentForMonth(property.rentSchedule, entry.year, entry.month);
        return {
          ...entry,
          expectedAmount: rentAmount,
          actualAmount: rentAmount,
        };
      }
      return entry;
    });
  }

  return updated;
}
