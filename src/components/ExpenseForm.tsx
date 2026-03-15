import { useState } from 'react';
import {
  Input,
  Button,
  Dropdown,
  Option,
  Field,
  Textarea,
  makeStyles,
  shorthands,
} from '@fluentui/react-components';
import { ExpenseCategory, EXPENSE_CATEGORY_LABELS } from '../models/types';
import { useStore } from '../store/useStore';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    ...shorthands.padding('16px'),
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '16px',
  },
});

interface Props {
  onClose: () => void;
}

export function ExpenseForm({ onClose }: Props) {
  const styles = useStyles();
  const { config, addExpense, saveYearData } = useStore();
  const properties = config?.properties.filter((p) => p.status === 'active') ?? [];

  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<ExpenseCategory>('repairs_maintenance');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    addExpense({
      propertyId,
      date,
      amount,
      category,
      description,
      isOneTime: true,
      notes: notes || undefined,
    });

    const year = new Date(date).getFullYear();
    await saveYearData(year);
    onClose();
  };

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const categories = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

  return (
    <div className={styles.form}>
      <Field label="Property" required>
        <Dropdown
          value={selectedProperty?.name ?? ''}
          selectedOptions={[propertyId]}
          onOptionSelect={(_, d) => setPropertyId(d.optionValue ?? '')}
        >
          {properties.map((p) => (
            <Option key={p.id} value={p.id}>{p.name}</Option>
          ))}
        </Dropdown>
      </Field>

      <Field label="Date" required>
        <Input type="date" value={date} onChange={(_, d) => setDate(d.value)} />
      </Field>

      <Field label="Amount" required>
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

      <Field label="Description" required>
        <Input
          value={description}
          onChange={(_, d) => setDescription(d.value)}
          placeholder="e.g., Replace water heater"
        />
      </Field>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(_, d) => setNotes(d.value)}
          placeholder="Optional notes..."
        />
      </Field>

      <div className={styles.actions}>
        <Button appearance="secondary" onClick={onClose}>Cancel</Button>
        <Button
          appearance="primary"
          onClick={handleSave}
          disabled={!propertyId || !description || amount <= 0}
        >
          Add Expense
        </Button>
      </div>
    </div>
  );
}
