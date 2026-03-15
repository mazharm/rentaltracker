import { useState } from 'react';
import {
  Text,
  Button,
  TabList,
  Tab,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Dialog,
  DialogSurface,
  Card,
  makeStyles,
  tokens,
  shorthands,
} from '@fluentui/react-components';
import { Add24Regular, Delete24Regular, Edit24Regular } from '@fluentui/react-icons';
import { useStore } from '../store/useStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { ExpenseForm } from '../components/ExpenseForm';
import { ExpenseEditDialog } from '../components/ExpenseEditDialog';
import { EXPENSE_CATEGORY_LABELS, ExpenseEntry } from '../models/types';

const useStyles = makeStyles({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tabs: {
    marginBottom: '16px',
  },
  card: {
    ...shorthands.padding('12px', '16px'),
    marginBottom: '8px',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding('2px', '0'),
  },
  amountCell: {
    fontVariantNumeric: 'tabular-nums',
  },
  fab: {
    position: 'fixed',
    bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))',
    right: '16px',
    zIndex: 999,
    borderRadius: tokens.borderRadiusCircular,
    width: '56px',
    height: '56px',
    minWidth: '56px',
  },
});

type ExpenseTab = 'recurring' | 'one-time' | 'all';

export function Expenses() {
  const styles = useStyles();
  const isMobile = useIsMobile();
  const { config, yearData, currentYear, deleteExpense, saveYearData } = useStore();
  const [tab, setTab] = useState<ExpenseTab>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseEntry | null>(null);

  const properties = config?.properties ?? [];
  const data = yearData[currentYear];

  const allExpenses = data?.expenseEntries
    .filter((e) => e.date.startsWith(`${currentYear}-`))
    .sort((a, b) => b.date.localeCompare(a.date)) ?? [];

  const filteredExpenses = tab === 'all'
    ? allExpenses
    : tab === 'recurring'
      ? allExpenses.filter((e) => !e.isOneTime)
      : allExpenses.filter((e) => e.isOneTime);

  const getPropertyName = (id: string) => properties.find((p) => p.id === id)?.name ?? 'Unknown';

  const handleDelete = async (expense: ExpenseEntry) => {
    deleteExpense(expense.id, currentYear);
    await saveYearData(currentYear);
  };

  return (
    <div>
      <div className={styles.header}>
        <Text as="h1" size={600} weight="semibold">Expenses</Text>
        {!isMobile && (
          <Button icon={<Add24Regular />} appearance="primary" onClick={() => setShowAdd(true)}>
            Add Expense
          </Button>
        )}
      </div>

      <TabList
        className={styles.tabs}
        selectedValue={tab}
        onTabSelect={(_, d) => setTab(d.value as ExpenseTab)}
      >
        <Tab value="all">All</Tab>
        <Tab value="recurring">Recurring</Tab>
        <Tab value="one-time">One-Time</Tab>
      </TabList>

      {isMobile ? (
        <div>
          {filteredExpenses.map((expense) => (
            <Card key={expense.id} className={styles.card} onClick={() => setEditExpense(expense)}>
              <div className={styles.cardRow}>
                <Text weight="semibold">{expense.description}</Text>
                <Text weight="semibold">${expense.amount.toLocaleString()}</Text>
              </div>
              <div className={styles.cardRow}>
                <Text size={200}>{getPropertyName(expense.propertyId)}</Text>
                <Badge appearance="outline" size="small">
                  {EXPENSE_CATEGORY_LABELS[expense.category]}
                </Badge>
              </div>
              <div className={styles.cardRow}>
                <Text size={200}>{expense.date}</Text>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {expense.isOneTime && (
                    <Button
                      icon={<Delete24Regular />}
                      size="small"
                      appearance="subtle"
                      onClick={(e) => { e.stopPropagation(); handleDelete(expense); }}
                    />
                  )}
                </div>
              </div>
            </Card>
          ))}
          {filteredExpenses.length === 0 && <Text>No expenses found.</Text>}
          <Button
            className={styles.fab}
            icon={<Add24Regular />}
            appearance="primary"
            shape="circular"
            onClick={() => setShowAdd(true)}
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>Property</TableHeaderCell>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Amount</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExpenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{expense.date}</TableCell>
                <TableCell>{getPropertyName(expense.propertyId)}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>
                  <Badge appearance="outline">{EXPENSE_CATEGORY_LABELS[expense.category]}</Badge>
                </TableCell>
                <TableCell className={styles.amountCell}>
                  ${expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <Badge color={expense.isOneTime ? 'warning' : 'informative'} appearance="tint">
                    {expense.isOneTime ? 'One-time' : 'Recurring'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    icon={<Edit24Regular />}
                    size="small"
                    appearance="subtle"
                    onClick={() => setEditExpense(expense)}
                  />
                  {expense.isOneTime && (
                    <Button
                      icon={<Delete24Regular />}
                      size="small"
                      appearance="subtle"
                      onClick={() => handleDelete(expense)}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {showAdd && (
        <Dialog open onOpenChange={(_, d) => { if (!d.open) setShowAdd(false); }}>
          <DialogSurface style={isMobile ? { width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0 } : {}}>
            <ExpenseForm onClose={() => setShowAdd(false)} />
          </DialogSurface>
        </Dialog>
      )}

      {editExpense && (
        <ExpenseEditDialog
          expense={editExpense}
          propertyName={getPropertyName(editExpense.propertyId)}
          onClose={() => setEditExpense(null)}
        />
      )}
    </div>
  );
}
