import { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  Button,
  Dropdown,
  Option,
  Field,
  Input,
  Textarea,
  makeStyles,
  shorthands,
} from '@fluentui/react-components';
import { ExpenseEntry, ExpenseCategory, EXPENSE_CATEGORY_LABELS } from '../models/types';
import { useStore } from '../store/useStore';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    ...shorthands.padding('8px', '0'),
  },
});

interface Props {
  expense: ExpenseEntry;
  propertyName: string;
  onClose: () => void;
}

export function ExpenseEditDialog({ expense, propertyName, onClose }: Props) {
  const styles = useStyles();
  const { updateExpense, saveYearData } = useStore();

  const [amount, setAmount] = useState(expense.amount);
  const [date, setDate] = useState(expense.date);
  const [description, setDescription] = useState(expense.description);
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [notes, setNotes] = useState(expense.notes ?? '');

  const categories = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];
  const year = new Date(expense.date).getFullYear();

  const handleSave = async () => {
    updateExpense(expense.id, year, {
      amount,
      date,
      description,
      category,
      notes: notes || undefined,
    });
    await saveYearData(year);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogTitle>Edit Expense</DialogTitle>
        <DialogBody>
          <div className={styles.form}>
            <Field label="Property">
              <Input value={propertyName} disabled />
            </Field>

            <Field label="Date">
              <Input type="date" value={date} onChange={(_, d) => setDate(d.value)} />
            </Field>

            <Field label="Amount">
              <Input
                type="number"
                value={String(amount)}
                onChange={(_, d) => setAmount(Math.max(0, Number(d.value) || 0))}
              />
            </Field>

            <Field label="Category">
              <Dropdown
                value={EXPENSE_CATEGORY_LABELS[category]}
                selectedOptions={[category]}
                onOptionSelect={(_, d) => setCategory(d.optionValue as ExpenseCategory)}
              >
                {categories.map(([value, label]) => (
                  <Option key={value} value={value}>{label}</Option>
                ))}
              </Dropdown>
            </Field>

            <Field label="Description">
              <Input
                value={description}
                onChange={(_, d) => setDescription(d.value)}
              />
            </Field>

            <Field label="Notes">
              <Textarea
                value={notes}
                onChange={(_, d) => setNotes(d.value)}
                placeholder="e.g., Cancelled this month, property vacant..."
              />
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button appearance="secondary" onClick={onClose}>Cancel</Button>
          <Button
            appearance="primary"
            onClick={handleSave}
            disabled={!description || amount < 0}
          >
            Save
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
