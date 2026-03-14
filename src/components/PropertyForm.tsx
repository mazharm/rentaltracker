import { useState } from 'react';
import {
  Input,
  Button,
  SpinButton,
  Dropdown,
  Option,
  makeStyles,
  Field,
  shorthands,
} from '@fluentui/react-components';
import { Property } from '../models/types';
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
  property?: Property;
  onClose: () => void;
}

export function PropertyForm({ property, onClose }: Props) {
  const styles = useStyles();
  const { addProperty, updateProperty, syncAfterConfigChange } = useStore();

  const [name, setName] = useState(property?.name ?? '');
  const [address, setAddress] = useState(property?.address ?? '');
  const [monthlyRent, setMonthlyRent] = useState(property?.monthlyRent ?? 0);
  const [rentStartDate, setRentStartDate] = useState(
    property?.rentStartDate ?? new Date().toISOString().split('T')[0]
  );
  const [taxAmount, setTaxAmount] = useState(property?.propertyTax.annualAmount ?? 0);
  const [taxMonth, setTaxMonth] = useState(String(property?.propertyTax.dueMonth ?? 1));
  const [status, setStatus] = useState<'active' | 'inactive'>(property?.status ?? 'active');

  const handleSave = async () => {
    const data: Omit<Property, 'id'> = {
      name,
      address,
      monthlyRent,
      rentStartDate,
      propertyTax: { annualAmount: taxAmount, dueMonth: Number(taxMonth) },
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

      <Field label="Monthly Rent">
        <SpinButton
          value={monthlyRent}
          onChange={(_, d) => setMonthlyRent(d.value ?? 0)}
          min={0}
          step={50}
        />
      </Field>

      <Field label="Rent Start Date">
        <Input
          type="date"
          value={rentStartDate}
          onChange={(_, d) => setRentStartDate(d.value)}
        />
      </Field>

      <Field label="Annual Property Tax">
        <SpinButton
          value={taxAmount}
          onChange={(_, d) => setTaxAmount(d.value ?? 0)}
          min={0}
          step={100}
        />
      </Field>

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
