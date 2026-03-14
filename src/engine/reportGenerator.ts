import {
  YearData,
  Property,
  ScheduleEReport,
  ScheduleEPropertyReport,
  ScheduleELineItems,
} from '../models/types';

export function generateScheduleEReport(
  year: number,
  yearData: YearData | undefined,
  properties: Property[]
): ScheduleEReport {
  const activeProperties = properties.filter((p) => p.status === 'active' || hasDataForYear(p.id, yearData));

  const propertyReports: ScheduleEPropertyReport[] = activeProperties.map((property) =>
    generatePropertyReport(year, property, yearData)
  );

  const totals = aggregateLineItems(propertyReports.map((r) => r.lineItems));

  return { year, properties: propertyReports, totals };
}

function hasDataForYear(propertyId: string, yearData: YearData | undefined): boolean {
  if (!yearData) return false;
  return (
    yearData.rentEntries.some((e) => e.propertyId === propertyId) ||
    yearData.expenseEntries.some((e) => e.propertyId === propertyId)
  );
}

function generatePropertyReport(
  year: number,
  property: Property,
  yearData: YearData | undefined
): ScheduleEPropertyReport {
  const rentEntries = yearData?.rentEntries.filter(
    (e) => e.propertyId === property.id && e.year === year
  ) ?? [];

  const expenseEntries = yearData?.expenseEntries.filter(
    (e) => e.propertyId === property.id && e.date.startsWith(`${year}-`)
  ) ?? [];

  // Line 3: Sum actualAmount for all non-vacant entries (includes deposit_retained)
  const rentsReceived = rentEntries
    .filter((e) => e.status !== 'vacant')
    .reduce((sum, e) => sum + e.actualAmount, 0);

  const expenseByCategory = (categories: string[]) =>
    expenseEntries
      .filter((e) => categories.includes(e.category))
      .reduce((sum, e) => sum + e.amount, 0);

  const lineItems: ScheduleELineItems = {
    rentsReceived,
    advertising: expenseByCategory(['advertising']),
    cleaningMaintenance: expenseByCategory(['landscaping', 'roof_cleaning', 'repairs_maintenance']),
    insurance: expenseByCategory(['appliance_insurance', 'property_insurance']),
    legalProfessional: expenseByCategory(['legal_professional']),
    managementFees: expenseByCategory(['management_fees']),
    taxes: expenseByCategory(['property_tax']),
    utilities: expenseByCategory(['utilities']),
    otherExpenses: expenseByCategory(['other']),
    totalExpenses: 0,
  };

  lineItems.totalExpenses =
    lineItems.advertising +
    lineItems.cleaningMaintenance +
    lineItems.insurance +
    lineItems.legalProfessional +
    lineItems.managementFees +
    lineItems.taxes +
    lineItems.utilities +
    lineItems.otherExpenses;

  return {
    propertyId: property.id,
    propertyName: property.name,
    propertyAddress: property.address,
    lineItems,
    netIncome: rentsReceived - lineItems.totalExpenses,
  };
}

function aggregateLineItems(items: ScheduleELineItems[]): ScheduleELineItems {
  const totals: ScheduleELineItems = {
    rentsReceived: 0,
    advertising: 0,
    cleaningMaintenance: 0,
    insurance: 0,
    legalProfessional: 0,
    managementFees: 0,
    taxes: 0,
    utilities: 0,
    otherExpenses: 0,
    totalExpenses: 0,
  };

  for (const item of items) {
    totals.rentsReceived += item.rentsReceived;
    totals.advertising += item.advertising;
    totals.cleaningMaintenance += item.cleaningMaintenance;
    totals.insurance += item.insurance;
    totals.legalProfessional += item.legalProfessional;
    totals.managementFees += item.managementFees;
    totals.taxes += item.taxes;
    totals.utilities += item.utilities;
    totals.otherExpenses += item.otherExpenses;
    totals.totalExpenses += item.totalExpenses;
  }

  return totals;
}

export function generateCSV(report: ScheduleEReport): string {
  const rows: string[] = ['Property,Address,Line,Description,Amount'];

  for (const prop of report.properties) {
    const addLine = (line: string, desc: string, amount: number) => {
      rows.push(`"${prop.propertyName}","${prop.propertyAddress}","${line}","${desc}",${amount.toFixed(2)}`);
    };

    addLine('3', 'Rents received', prop.lineItems.rentsReceived);
    addLine('4', 'Royalties received', 0);
    addLine('5', 'Advertising', prop.lineItems.advertising);
    addLine('6', 'Auto and travel', 0);
    addLine('7', 'Cleaning and maintenance', prop.lineItems.cleaningMaintenance);
    addLine('8', 'Commissions', 0);
    addLine('9', 'Insurance', prop.lineItems.insurance);
    addLine('10', 'Legal and professional fees', prop.lineItems.legalProfessional);
    addLine('11', 'Management fees', prop.lineItems.managementFees);
    addLine('12', 'Mortgage interest paid', 0);
    addLine('13', 'Other interest', 0);
    addLine('14', 'Repairs', 0);
    addLine('15', 'Supplies', 0);
    addLine('16', 'Taxes', prop.lineItems.taxes);
    addLine('17', 'Utilities', prop.lineItems.utilities);
    addLine('18', 'Depreciation', 0);
    addLine('19', 'Other', prop.lineItems.otherExpenses);
    addLine('20', 'Total expenses', prop.lineItems.totalExpenses);
    addLine('21', 'Net income (loss)', prop.netIncome);
  }

  return rows.join('\n');
}
