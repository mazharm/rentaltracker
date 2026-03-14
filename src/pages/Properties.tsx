import { useState } from 'react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Button,
  Badge,
  Text,
  Dialog,
  DialogSurface,
  Card,
  CardHeader,
  makeStyles,
  shorthands,
} from '@fluentui/react-components';
import { Add24Regular, Edit24Regular } from '@fluentui/react-icons';
import { useStore } from '../store/useStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { PropertyForm } from '../components/PropertyForm';
import { Property } from '../models/types';

const useStyles = makeStyles({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  card: {
    ...shorthands.padding('12px', '16px'),
    marginBottom: '8px',
    cursor: 'pointer',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding('2px', '0'),
  },
});

export function Properties() {
  const styles = useStyles();
  const isMobile = useIsMobile();
  const { config } = useStore();
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const properties = config?.properties ?? [];

  return (
    <div>
      <div className={styles.header}>
        <Text as="h1" size={600} weight="semibold">Properties</Text>
        <Button icon={<Add24Regular />} appearance="primary" onClick={() => setShowAdd(true)}>
          {isMobile ? 'Add' : 'Add Property'}
        </Button>
      </div>

      {isMobile ? (
        <div>
          {properties.map((property) => (
            <Card
              key={property.id}
              className={styles.card}
              onClick={() => setEditingProperty(property)}
            >
              <CardHeader
                header={<Text weight="semibold">{property.name}</Text>}
                action={
                  <Badge color={property.status === 'active' ? 'success' : 'danger'} appearance="filled">
                    {property.status}
                  </Badge>
                }
              />
              <div className={styles.cardRow}>
                <Text size={200}>Rent</Text>
                <Text>${property.monthlyRent.toLocaleString()}/mo</Text>
              </div>
              <div className={styles.cardRow}>
                <Text size={200}>Address</Text>
                <Text size={200}>{property.address}</Text>
              </div>
              {property.deposit && (
                <div className={styles.cardRow}>
                  <Text size={200}>Deposit</Text>
                  <Text size={200}>${property.deposit.amount.toLocaleString()}</Text>
                </div>
              )}
            </Card>
          ))}
          {properties.length === 0 && (
            <Text>No properties yet. Add your first property to get started.</Text>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Address</TableHeaderCell>
              <TableHeaderCell>Monthly Rent</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Deposit</TableHeaderCell>
              <TableHeaderCell>Property Tax</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.map((property) => (
              <TableRow key={property.id}>
                <TableCell>{property.name}</TableCell>
                <TableCell>{property.address}</TableCell>
                <TableCell>${property.monthlyRent.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge color={property.status === 'active' ? 'success' : 'danger'} appearance="filled">
                    {property.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {property.deposit ? `$${property.deposit.amount.toLocaleString()}` : '—'}
                </TableCell>
                <TableCell>${property.propertyTax.annualAmount.toLocaleString()}/yr</TableCell>
                <TableCell>
                  <Button
                    icon={<Edit24Regular />}
                    size="small"
                    onClick={() => setEditingProperty(property)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(showAdd || editingProperty) && (
        <Dialog open onOpenChange={(_, d) => { if (!d.open) { setShowAdd(false); setEditingProperty(null); } }}>
          <DialogSurface style={isMobile ? { width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0 } : {}}>
            <PropertyForm
              property={editingProperty ?? undefined}
              onClose={() => { setShowAdd(false); setEditingProperty(null); }}
            />
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}
