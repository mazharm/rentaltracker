import { useState } from 'react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
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
  makeStyles,
  tokens,
  Text,
  Card,
  shorthands,
} from '@fluentui/react-components';
import { useStore } from '../store/useStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { Property, RentEntry, RentStatus } from '../models/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const useStyles = makeStyles({
  gridContainer: {
    overflowX: 'auto',
  },
  cell: {
    cursor: 'pointer',
    textAlign: 'center',
    minWidth: '80px',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  mobileCard: {
    ...shorthands.padding('12px'),
    marginBottom: '8px',
    cursor: 'pointer',
  },
  mobileRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding('4px', '0'),
  },
  propertySelector: {
    marginBottom: '16px',
  },
  totalsRow: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

const STATUS_COLORS: Record<RentStatus, 'success' | 'warning' | 'danger' | 'informative' | 'important'> = {
  received: 'success',
  accrued: 'informative',
  vacant: 'danger',
  partial: 'warning',
  deposit_retained: 'important',
};

export function RentGrid() {
  const styles = useStyles();
  const isMobile = useIsMobile();
  const { config, yearData, currentYear, overrideRent, saveYearData } = useStore();
  const [editEntry, setEditEntry] = useState<RentEntry | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');

  const properties = config?.properties.filter((p) => p.status === 'active') ?? [];
  const data = yearData[currentYear];

  if (isMobile) {
    const property = properties.find((p) => p.id === selectedPropertyId) || properties[0];
    if (!property) return <Text>No properties configured.</Text>;

    const entries = data?.rentEntries.filter((e) => e.propertyId === property.id && e.year === currentYear) ?? [];

    return (
      <div>
        <div className={styles.propertySelector}>
          <Dropdown
            value={property.name}
            selectedOptions={[property.id]}
            onOptionSelect={(_, d) => setSelectedPropertyId(d.optionValue ?? '')}
          >
            {properties.map((p) => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Dropdown>
        </div>

        {MONTHS.map((monthName, i) => {
          const month = i + 1;
          const entry = entries.find((e) => e.month === month);
          return (
            <Card key={month} className={styles.mobileCard} onClick={() => entry && setEditEntry(entry)}>
              <div className={styles.mobileRow}>
                <Text weight="semibold">{monthName}</Text>
                <Badge color={entry ? STATUS_COLORS[entry.status] : 'informative'} appearance="filled">
                  {entry?.status ?? 'N/A'}
                </Badge>
              </div>
              <div className={styles.mobileRow}>
                <Text size={200}>Amount</Text>
                <Text>${entry?.actualAmount?.toLocaleString() ?? '—'}</Text>
              </div>
            </Card>
          );
        })}

        {editEntry && (
          <RentEditDialog entry={editEntry} onClose={() => setEditEntry(null)} onSave={async (override) => {
            overrideRent(editEntry.propertyId, editEntry.month, editEntry.year, override);
            await saveYearData(currentYear);
            setEditEntry(null);
          }} />
        )}
      </div>
    );
  }

  // Desktop: full grid
  return (
    <div className={styles.gridContainer}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Property</TableHeaderCell>
            {MONTHS.map((m) => (
              <TableHeaderCell key={m}>{m}</TableHeaderCell>
            ))}
            <TableHeaderCell>Total</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((property) => (
            <PropertyRow
              key={property.id}
              property={property}
              entries={data?.rentEntries.filter((e) => e.propertyId === property.id && e.year === currentYear) ?? []}
              onCellClick={setEditEntry}
            />
          ))}
          <TotalsRow properties={properties} entries={data?.rentEntries.filter((e) => e.year === currentYear) ?? []} />
        </TableBody>
      </Table>

      {editEntry && (
        <RentEditDialog entry={editEntry} onClose={() => setEditEntry(null)} onSave={async (override) => {
          overrideRent(editEntry.propertyId, editEntry.month, editEntry.year, override);
          await saveYearData(currentYear);
          setEditEntry(null);
        }} />
      )}
    </div>
  );
}

function PropertyRow({ property, entries, onCellClick }: {
  property: Property;
  entries: RentEntry[];
  onCellClick: (entry: RentEntry) => void;
}) {
  const styles = useStyles();

  return (
    <TableRow>
      <TableCell>{property.name}</TableCell>
      {MONTHS.map((_, i) => {
        const month = i + 1;
        const entry = entries.find((e) => e.month === month);
        return (
          <TableCell key={month} className={styles.cell} onClick={() => entry && onCellClick(entry)}>
            {entry ? (
              <>
                <div>${entry.actualAmount.toLocaleString()}</div>
                <Badge size="tiny" color={STATUS_COLORS[entry.status]} appearance="filled">
                  {entry.status}
                </Badge>
              </>
            ) : '—'}
          </TableCell>
        );
      })}
      <TableCell>
        <Text weight="semibold">
          ${entries.reduce((sum, e) => sum + e.actualAmount, 0).toLocaleString()}
        </Text>
      </TableCell>
    </TableRow>
  );
}

function TotalsRow({ properties, entries }: { properties: Property[]; entries: RentEntry[] }) {
  const styles = useStyles();

  return (
    <TableRow className={styles.totalsRow}>
      <TableCell><Text weight="semibold">Totals</Text></TableCell>
      {MONTHS.map((_, i) => {
        const month = i + 1;
        const total = entries
          .filter((e) => e.month === month && properties.some((p) => p.id === e.propertyId))
          .reduce((sum, e) => sum + e.actualAmount, 0);
        return <TableCell key={month}>${total.toLocaleString()}</TableCell>;
      })}
      <TableCell>
        <Text weight="semibold">
          ${entries.reduce((sum, e) => sum + e.actualAmount, 0).toLocaleString()}
        </Text>
      </TableCell>
    </TableRow>
  );
}

function RentEditDialog({ entry, onClose, onSave }: {
  entry: RentEntry;
  onClose: () => void;
  onSave: (override: Partial<RentEntry>) => void;
}) {
  const [status, setStatus] = useState(entry.status);
  const [actualAmount, setActualAmount] = useState(entry.actualAmount);
  const [reason, setReason] = useState(entry.overrideReason ?? '');

  const handleStatusChange = (newStatus: string) => {
    const s = newStatus as RentStatus;
    setStatus(s);
    if (s === 'vacant') setActualAmount(0);
    else if (s === 'received' || s === 'accrued') setActualAmount(entry.expectedAmount);
  };

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogTitle>Edit Rent — {MONTHS[entry.month - 1]} {entry.year}</DialogTitle>
        <DialogBody>
          <Field label="Status">
            <Dropdown
              value={status}
              selectedOptions={[status]}
              onOptionSelect={(_, d) => handleStatusChange(d.optionValue ?? 'accrued')}
            >
              <Option value="accrued">Accrued</Option>
              <Option value="received">Received</Option>
              <Option value="vacant">Vacant</Option>
              <Option value="partial">Partial</Option>
            </Dropdown>
          </Field>

          <Field label="Amount">
            <Input
              type="number"
              value={String(actualAmount)}
              onChange={(_, d) => setActualAmount(Math.max(0, Number(d.value) || 0))}
              disabled={status === 'vacant'}
            />
          </Field>

          <Field label="Reason (optional)">
            <Input value={reason} onChange={(_, d) => setReason(d.value)} />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button appearance="secondary" onClick={onClose}>Cancel</Button>
          <Button appearance="primary" onClick={() => onSave({
            status,
            actualAmount,
            overrideReason: reason || undefined,
          })}>Save</Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
