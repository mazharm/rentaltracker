import { useState } from 'react';
import {
  Text,
  Button,
  Card,
  Badge,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Input,
  SpinButton,
  Dropdown,
  Option,
  Field,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  Divider,
  MessageBar,
  MessageBarBody,
  makeStyles,
  shorthands,
} from '@fluentui/react-components';
import {
  Add24Regular,
  Edit24Regular,
  Delete24Regular,
  ArrowDownload24Regular,
  SignOut24Regular,
} from '@fluentui/react-icons';
import { useMsal } from '@azure/msal-react';
import { useStore } from '../store/useStore';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  RecurringExpenseTemplate,
  ExpenseCategory,
  EXPENSE_CATEGORY_LABELS,
} from '../models/types';
import { loginRequest } from '../auth/msalConfig';

const useStyles = makeStyles({
  section: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  card: {
    ...shorthands.padding('16px'),
    marginBottom: '12px',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding('4px', '0'),
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
});

export function Settings() {
  const styles = useStyles();
  const { instance } = useMsal();
  const isMobile = useIsMobile();
  const { config, isAuthenticated, user, lastSyncTime, loadFromOneDrive, saveConfig } = useStore();
  const [editTemplate, setEditTemplate] = useState<RecurringExpenseTemplate | null>(null);
  const [showAddTemplate, setShowAddTemplate] = useState(false);

  const templates = config?.recurringExpenseTemplates ?? [];

  const handleSignIn = async () => {
    try {
      await instance.loginPopup(loginRequest);
      await loadFromOneDrive();
    } catch (e) {
      console.error('Sign-in failed:', e);
    }
  };

  const handleSignOut = async () => {
    await instance.logoutPopup();
    useStore.setState({
      isAuthenticated: false,
      user: null,
      config: null,
      yearData: {},
    });
  };

  const handleExport = () => {
    const data = {
      config,
      yearData: useStore.getState().yearData,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rental-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Text as="h1" size={600} weight="semibold" block style={{ marginBottom: 16 }}>
        Settings
      </Text>

      {/* OneDrive Connection */}
      <div className={styles.section}>
        <Text as="h2" size={400} weight="semibold" block style={{ marginBottom: 8 }}>
          OneDrive
        </Text>
        <Card className={styles.card}>
          <div className={styles.cardRow}>
            <Text>Status</Text>
            <Badge color={isAuthenticated ? 'success' : 'danger'} appearance="filled">
              {isAuthenticated ? 'Connected' : 'Not connected'}
            </Badge>
          </div>
          {user && (
            <div className={styles.cardRow}>
              <Text>Account</Text>
              <Text size={200}>{user.name || user.username}</Text>
            </div>
          )}
          {lastSyncTime && (
            <div className={styles.cardRow}>
              <Text>Last sync</Text>
              <Text size={200}>{lastSyncTime.toLocaleTimeString()}</Text>
            </div>
          )}
          <div className={styles.cardRow}>
            {isAuthenticated ? (
              <Button icon={<SignOut24Regular />} onClick={handleSignOut}>Sign Out</Button>
            ) : (
              <Button appearance="primary" onClick={handleSignIn}>Sign in with Microsoft</Button>
            )}
          </div>
        </Card>
      </div>

      <Divider />

      {/* Recurring Templates */}
      <div className={styles.section} style={{ marginTop: 24 }}>
        <div className={styles.sectionHeader}>
          <Text as="h2" size={400} weight="semibold">Recurring Templates</Text>
          <Button icon={<Add24Regular />} size="small" onClick={() => setShowAddTemplate(true)}>
            {isMobile ? 'Add' : 'Add Template'}
          </Button>
        </div>

        {isMobile ? (
          <div>
            {templates.map((t) => (
              <Card key={t.id} className={styles.card}>
                <div className={styles.cardRow}>
                  <Text weight="semibold">{t.name}</Text>
                  <Text>${t.amount.toLocaleString()}</Text>
                </div>
                <div className={styles.cardRow}>
                  <Text size={200}>{t.frequency}</Text>
                  <Badge appearance="outline" size="small">
                    {EXPENSE_CATEGORY_LABELS[t.category]}
                  </Badge>
                </div>
                <div className={styles.cardRow}>
                  <Button icon={<Edit24Regular />} size="small" appearance="subtle" onClick={() => setEditTemplate(t)}>
                    Edit
                  </Button>
                  <Button icon={<Delete24Regular />} size="small" appearance="subtle" onClick={async () => {
                    useStore.getState().deleteTemplate(t.id);
                    await saveConfig();
                  }}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Frequency</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.frequency}</TableCell>
                  <TableCell>${t.amount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge appearance="outline">{EXPENSE_CATEGORY_LABELS[t.category]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button icon={<Edit24Regular />} size="small" appearance="subtle" onClick={() => setEditTemplate(t)} />
                    <Button icon={<Delete24Regular />} size="small" appearance="subtle" onClick={async () => {
                      useStore.getState().deleteTemplate(t.id);
                      await saveConfig();
                    }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Divider />

      {/* Data */}
      <div className={styles.section} style={{ marginTop: 24 }}>
        <Text as="h2" size={400} weight="semibold" block style={{ marginBottom: 8 }}>
          Data
        </Text>
        <Button icon={<ArrowDownload24Regular />} onClick={handleExport}>
          Export All Data (JSON)
        </Button>
      </div>

      <Divider />

      {/* About */}
      <div className={styles.section} style={{ marginTop: 24 }}>
        <Text as="h2" size={400} weight="semibold" block style={{ marginBottom: 8 }}>
          About
        </Text>
        <MessageBar>
          <MessageBarBody>RentalTracker v1.0 — Schedule E aligned rental income tracker</MessageBarBody>
        </MessageBar>
      </div>

      {/* Template Edit Dialog */}
      {(showAddTemplate || editTemplate) && (
        <TemplateDialog
          template={editTemplate}
          isMobile={isMobile}
          onClose={() => { setShowAddTemplate(false); setEditTemplate(null); }}
          onSave={async (data) => {
            if (editTemplate) {
              useStore.getState().updateTemplate(editTemplate.id, data);
            } else {
              useStore.getState().addTemplate({
                ...data,
                startDate: data.startDate || new Date().toISOString().split('T')[0],
              } as Omit<RecurringExpenseTemplate, 'id'>);
            }
            await saveConfig();
            setShowAddTemplate(false);
            setEditTemplate(null);
          }}
        />
      )}
    </div>
  );
}

function TemplateDialog({ template, isMobile, onClose, onSave }: {
  template: RecurringExpenseTemplate | null;
  isMobile: boolean;
  onClose: () => void;
  onSave: (data: Partial<RecurringExpenseTemplate>) => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [frequency, setFrequency] = useState(template?.frequency ?? 'monthly');
  const [amount, setAmount] = useState(template?.amount ?? 0);
  const [category, setCategory] = useState<ExpenseCategory>(template?.category ?? 'other');
  const [startDate, setStartDate] = useState(template?.startDate ?? new Date().toISOString().split('T')[0]);

  const categories = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={isMobile ? { width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0 } : {}}>
        <DialogTitle>{template ? 'Edit Template' : 'Add Template'}</DialogTitle>
        <DialogBody>
          <Field label="Name" required>
            <Input value={name} onChange={(_, d) => setName(d.value)} />
          </Field>
          <Field label="Frequency">
            <Dropdown
              value={frequency}
              selectedOptions={[frequency]}
              onOptionSelect={(_, d) => setFrequency(d.optionValue as RecurringExpenseTemplate['frequency'])}
            >
              <Option value="monthly">Monthly</Option>
              <Option value="quarterly">Quarterly</Option>
              <Option value="semi-annual">Semi-Annual</Option>
              <Option value="annual">Annual</Option>
            </Dropdown>
          </Field>
          <Field label="Amount">
            <SpinButton value={amount} onChange={(_, d) => setAmount(d.value ?? 0)} min={0} step={10} />
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
          <Field label="Start Date">
            <Input type="date" value={startDate} onChange={(_, d) => setStartDate(d.value)} />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button appearance="secondary" onClick={onClose}>Cancel</Button>
          <Button appearance="primary" disabled={!name} onClick={() => onSave({
            name, frequency, amount, category, startDate, appliesToPropertyIds: 'all',
          })}>
            {template ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
