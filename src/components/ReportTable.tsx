import {
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Text,
  Card,
  CardHeader,
  makeStyles,
  tokens,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  shorthands,
} from '@fluentui/react-components';
import { ScheduleEReport, ScheduleELineItems } from '../models/types';
import { useIsMobile } from '../hooks/useIsMobile';

const useStyles = makeStyles({
  summaryCard: {
    marginBottom: '16px',
    ...shorthands.padding('16px'),
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    ...shorthands.padding('4px', '0'),
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    ...shorthands.padding('8px', '0'),
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
    marginTop: '8px',
  },
  netIncome: {
    display: 'flex',
    justifyContent: 'space-between',
    ...shorthands.padding('8px', '0'),
    ...shorthands.borderTop('2px', 'solid', tokens.colorNeutralStroke1),
    marginTop: '4px',
  },
});

const LINE_ITEMS: { key: keyof ScheduleELineItems; line: string; label: string }[] = [
  { key: 'rentsReceived', line: '3', label: 'Rents received' },
  { key: 'advertising', line: '5', label: 'Advertising' },
  { key: 'cleaningMaintenance', line: '7', label: 'Cleaning and maintenance' },
  { key: 'insurance', line: '9', label: 'Insurance' },
  { key: 'legalProfessional', line: '10', label: 'Legal and professional fees' },
  { key: 'managementFees', line: '12', label: 'Management fees' },
  { key: 'taxes', line: '16', label: 'Taxes' },
  { key: 'utilities', line: '17', label: 'Utilities' },
  { key: 'otherExpenses', line: '19', label: 'Other expenses' },
  { key: 'totalExpenses', line: '20', label: 'Total expenses' },
];

interface Props {
  report: ScheduleEReport;
}

export function ReportTable({ report }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileReport report={report} />;
  }

  return <DesktopReport report={report} />;
}

function DesktopReport({ report }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Property</TableHeaderCell>
          <TableHeaderCell>Line</TableHeaderCell>
          <TableHeaderCell>Description</TableHeaderCell>
          <TableHeaderCell>Amount</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.properties.map((prop) => (
          <>
            {LINE_ITEMS.map((item) => (
              <TableRow key={`${prop.propertyId}-${item.key}`}>
                <TableCell>{item.key === 'rentsReceived' ? prop.propertyName : ''}</TableCell>
                <TableCell>{item.line}</TableCell>
                <TableCell>{item.label}</TableCell>
                <TableCell>${prop.lineItems[item.key].toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell />
              <TableCell>21</TableCell>
              <TableCell><Text weight="semibold">Net income (loss)</Text></TableCell>
              <TableCell>
                <Text weight="semibold">
                  ${prop.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </TableCell>
            </TableRow>
          </>
        ))}
      </TableBody>
    </Table>
  );
}

function MobileReport({ report }: Props) {
  const styles = useStyles();

  return (
    <div>
      <Card className={styles.summaryCard}>
        <CardHeader header={<Text weight="semibold">Summary — {report.year}</Text>} />
        <LineItemsList items={report.totals} />
        <div className={styles.netIncome}>
          <Text weight="semibold">Net Income</Text>
          <Text weight="semibold">
            ${(report.totals.rentsReceived - report.totals.totalExpenses).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
        </div>
      </Card>

      <Accordion multiple>
        {report.properties.map((prop) => (
          <AccordionItem key={prop.propertyId} value={prop.propertyId}>
            <AccordionHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
                <Text>{prop.propertyName}</Text>
                <Text weight="semibold">${prop.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </div>
            </AccordionHeader>
            <AccordionPanel>
              <LineItemsList items={prop.lineItems} />
              <div className={styles.netIncome}>
                <Text weight="semibold">Net Income</Text>
                <Text weight="semibold">
                  ${prop.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </div>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function LineItemsList({ items }: { items: ScheduleELineItems }) {
  const styles = useStyles();

  return (
    <div>
      {LINE_ITEMS.map((item) => (
        <div key={item.key} className={item.key === 'totalExpenses' ? styles.totalRow : styles.summaryRow}>
          <Text size={200} weight={item.key === 'totalExpenses' ? 'semibold' : 'regular'}>
            Line {item.line}: {item.label}
          </Text>
          <Text size={200} weight={item.key === 'totalExpenses' ? 'semibold' : 'regular'}>
            ${items[item.key].toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
        </div>
      ))}
    </div>
  );
}
