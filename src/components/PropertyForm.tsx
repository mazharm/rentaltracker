import { useState } from 'react';
import {
  Input,
  Button,
  Dropdown,
  Option,
  makeStyles,
  Field,
  shorthands,
  Text,
} from '@fluentui/react-components';
import { Add24Regular, Delete24Regular } from '@fluentui/react-icons';
import { Property, RentPeriod, PropertyTaxYear } from '../models/types';
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
  scheduleRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'end',
  },
  scheduleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

interface Props {
  property?: Property;
  onClose: () => void;
}

function defaultRentStartMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function PropertyForm({ property, onClose }: Props) {
  const styles = useStyles();
  const { addProperty, updateProperty, syncAfterConfigChange } = useStore();

  const [name, setName] = useState(property?.name ?? '');
  const [address, setAddress] = useState(property?.address ?? '');
  const [rentStartDate, setRentStartDate] = useState(
    property?.rentStartDate ?? new Date().toISOString().split('T')[0]
  );
  const [rentSchedule, setRentSchedule] = useState<RentPeriod[]>(
    property?.rentSchedule ?? [{ startMonth: defaultRentStartMonth(), amount: 0 }]
  );
  const [taxAmounts, setTaxAmounts] = useState<PropertyTaxYear[]>(
    property?.propertyTax.annualAmounts ?? [{ year: new Date().getFullYear(), amount: 0 }]
  );
  const [taxMonth, setTaxMonth] = useState(String(property?.propertyTax.dueMonth ?? 1));
  const [status, setStatus] = useState<'active' | 'inactive'>(property?.status ?? 'active');

  const handleSave = async () => {
    const sortedSchedule = [...rentSchedule].sort((a, b) => a.startMonth.localeCompare(b.startMonth));
    const sortedTax = [...taxAmounts].sort((a, b) => a.year - b.year);

    const data: Omit<Property, 'id'> = {
      name,
      address,
      rentSchedule: sortedSchedule,
      rentStartDate,
      propertyTax: { annualAmounts: sortedTax, dueMonth: Number(taxMonth) },
      deposit: property?.deposit ?? null,
      status,
    };

    if (property) {
      updateProperty(property.id, data);
    } else {
      addProperty(data);
    }

    await syncAfterConfigChange();
    onClose();
  };

  const addRentPeriod = () => {
    const last = rentSchedule[rentSchedule.length - 1];
    // Default to next month after last entry
    let nextMonth = defaultRentStartMonth();
    if (last) {
      const [y, m] = last.startMonth.split('-').map(Number);
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      nextMonth = `${ny}-${String(nm).padStart(2, '0')}`;
    }
    setRentSchedule([...rentSchedule, { startMonth: nextMonth, amount: last?.amount ?? 0 }]);
  };

  const removeRentPeriod = (index: number) => {
    if (rentSchedule.length <= 1) return;
    setRentSchedule(rentSchedule.filter((_, i) => i !== index));
  };

  const updateRentPeriod = (index: number, updates: Partial<RentPeriod>) => {
    setRentSchedule(rentSchedule.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  };

  const addTaxYear = () => {
    const last = taxAmounts[taxAmounts.length - 1];
    const nextYear = last ? last.year + 1 : new Date().getFullYear();
    setTaxAmounts([...taxAmounts, { year: nextYear, amount: last?.amount ?? 0 }]);
  };

  const removeTaxYear = (index: number) => {
    if (taxAmounts.length <= 1) return;
    setTaxAmounts(taxAmounts.filter((_, i) => i !== index));
  };

  const updateTaxYear = (index: number, updates: Partial<PropertyTaxYear>) => {
    setTaxAmounts(taxAmounts.map((t, i) => (i === index ? { ...t, ...updates } : t)));
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <div className={styles.form}>
      <Field label="Property Name" required>
        <Input value={name} onChange={(_, d) => setName(d.value)} placeholder="e.g., 123 Elm St" />
      </Field>

      <Field label="Address" required>
        <Input value={address} onChange={(_, d) => setAddress(d.value)} placeholder="Full address" />
      </Field>

      <Field label="Rent Start Date">
        <Input
          type="date"
          value={rentStartDate}
          onChange={(_, d) => setRentStartDate(d.value)}
        />
      </Field>

      <div>
        <div className={styles.sectionHeader}>
          <Text weight="semibold">Rent Schedule</Text>
          <Button appearance="subtle" icon={<Add24Regular />} size="small" onClick={addRentPeriod}>
            Add Period
          </Button>
        </div>
        <div className={styles.scheduleList}>
          {rentSchedule.map((period, i) => (
            <div key={i} className={styles.scheduleRow}>
              <Field label="Starting Month" style={{ flex: 1 }}>
                <Input
                  type="month"
                  value={period.startMonth}
                  onChange={(_, d) => updateRentPeriod(i, { startMonth: d.value })}
                />
              </Field>
              <Field label="Monthly Rent" style={{ flex: 1 }}>
                <Input
                  type="number"
                  value={String(period.amount)}
                  onChange={(_, d) => updateRentPeriod(i, { amount: Math.max(0, Number(d.value) || 0) })}
                />
              </Field>
              {rentSchedule.length > 1 && (
                <Button
                  appearance="subtle"
                  icon={<Delete24Regular />}
                  size="small"
                  onClick={() => removeRentPeriod(i)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className={styles.sectionHeader}>
          <Text weight="semibold">Property Tax</Text>
          <Button appearance="subtle" icon={<Add24Regular />} size="small" onClick={addTaxYear}>
            Add Year
          </Button>
        </div>
        <div className={styles.scheduleList}>
          {taxAmounts.map((tax, i) => (
            <div key={i} className={styles.scheduleRow}>
              <Field label="Year" style={{ flex: 1 }}>
                <Input
                  type="number"
                  value={String(tax.year)}
                  onChange={(_, d) => updateTaxYear(i, { year: Number(d.value) || new Date().getFullYear() })}
                />
              </Field>
              <Field label="Annual Amount" style={{ flex: 1 }}>
                <Input
                  type="number"
                  value={String(tax.amount)}
                  onChange={(_, d) => updateTaxYear(i, { amount: Math.max(0, Number(d.value) || 0) })}
                />
              </Field>
              {taxAmounts.length > 1 && (
                <Button
                  appearance="subtle"
                  icon={<Delete24Regular />}
                  size="small"
                  onClick={() => removeTaxYear(i)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <Field label="Property Tax Due Month">
        <Dropdown
          value={months[Number(taxMonth) - 1]}
          selectedOptions={[taxMonth]}
          onOptionSelect={(_, d) => setTaxMonth(d.optionValue ?? '1')}
        >
          {months.map((m, i) => (
            <Option key={i + 1} value={String(i + 1)}>
              {m}
            </Option>
          ))}
        </Dropdown>
      </Field>

      {property && (
        <Field label="Status">
          <Dropdown
            value={status === 'active' ? 'Active' : 'Inactive'}
            selectedOptions={[status]}
            onOptionSelect={(_, d) => setStatus(d.optionValue as 'active' | 'inactive')}
          >
            <Option value="active">Active</Option>
            <Option value="inactive">Inactive</Option>
          </Dropdown>
        </Field>
      )}

      <div className={styles.actions}>
        <Button appearance="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button appearance="primary" onClick={handleSave} disabled={!name || !address}>
          {property ? 'Update' : 'Add Property'}
        </Button>
      </div>
    </div>
  );
}
