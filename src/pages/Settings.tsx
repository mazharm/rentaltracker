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
  const {
    config, isAuthenticated, user, lastSyncTime, loadFromOneDrive, syncAfterConfigChange,
    sharingConfig, linkedUsers, activeDataSource, setActiveDataSource,
    createShareLink, addSharedAccount, removeSharedAccount, registerAsLinkedUser,
  } = useStore();
  const [editTemplate, setEditTemplate] = useState<RecurringExpenseTemplate | null>(null);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showAddShared, setShowAddShared] = useState(false);
  const [shareLabel, setShareLabel] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);

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
    const { clearShareCache } = await import('../api/onedrive');
    clearShareCache();
    // Clear session storage cache to prevent cross-user data leakage
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('rt_')) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    } catch {
      // sessionStorage may be unavailable
    }
    await instance.logoutPopup();
    useStore.setState({
      isAuthenticated: false,
      user: null,
      config: null,
      yearData: {},
      activeDataSource: { type: 'own' },
      sharingConfig: { version: 1, myShareLink: null, sharedAccounts: [] },
      linkedUsers: [],
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
            <>
              <div className={styles.cardRow}>
                <Text>Name</Text>
                <Text size={200}>{user.name || '—'}</Text>
              </div>
              <div className={styles.cardRow}>
                <Text>Email</Text>
                <Text size={200}>{user.username || '—'}</Text>
              </div>
            </>
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

      {/* Share My Data */}
      <div className={styles.section} style={{ marginTop: 24 }}>
        <Text as="h2" size={400} weight="semibold" block style={{ marginBottom: 8 }}>
          Share My Data
        </Text>
        <Card className={styles.card}>
          {sharingConfig.myShareLink ? (
            <>
              <Text size={200} block style={{ marginBottom: 8 }}>
                Send this link to another user so they can view and edit your rental data.
              </Text>
              <Input
                readOnly
                value={sharingConfig.myShareLink}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button size="small" appearance="primary" onClick={() => {
                  navigator.clipboard.writeText(sharingConfig.myShareLink!);
                }}>
                  Copy Link
                </Button>
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={creatingLink}
                  onClick={async () => {
                    setCreatingLink(true);
                    try { await createShareLink(); } finally { setCreatingLink(false); }
                  }}
                >
                  {creatingLink ? 'Regenerating...' : 'Regenerate'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Text size={200} block style={{ marginBottom: 8 }}>
                Create a share link so another user can access your rental data.
              </Text>
              <Button
                appearance="primary"
                disabled={creatingLink}
                onClick={async () => {
                  setCreatingLink(true);
                  try { await createShareLink(); } finally { setCreatingLink(false); }
                }}
              >
                {creatingLink ? 'Creating...' : 'Create Share Link'}
              </Button>
            </>
          )}
        </Card>
      </div>

      {/* Linked Accounts — people who have accepted your share link */}
      {sharingConfig.myShareLink && (
        <>
          <Divider />
          <div className={styles.section} style={{ marginTop: 24 }}>
            <Text as="h2" size={400} weight="semibold" block style={{ marginBottom: 8 }}>
              Linked Accounts
            </Text>
            {linkedUsers.length === 0 ? (
              <Text size={200}>No one has linked to your data yet. Share your link above to invite someone.</Text>
            ) : (
              linkedUsers.map((lu, i) => (
                <Card key={i} className={styles.card}>
                  <div className={styles.cardRow}>
                    <Text weight="semibold">{lu.name}</Text>
                    <Text size={200}>{lu.email}</Text>
                  </div>
                  <div className={styles.cardRow}>
                    <Text size={200}>Linked {new Date(lu.linkedAt).toLocaleDateString()}</Text>
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      <Divider />

      {/* Shared Accounts */}
      <div className={styles.section} style={{ marginTop: 24 }}>
        <div className={styles.sectionHeader}>
          <Text as="h2" size={400} weight="semibold">Shared Accounts</Text>
          <Button icon={<Add24Regular />} size="small" onClick={() => setShowAddShared(true)}>
            Add
          </Button>
        </div>
        {sharingConfig.sharedAccounts.length === 0 ? (
          <Text size={200}>No shared accounts. Paste a share link from another user to access their data.</Text>
        ) : (
          sharingConfig.sharedAccounts.map((account) => {
            const isActive = activeDataSource.type === 'shared' && activeDataSource.accountId === account.id;
            return (
              <Card key={account.id} className={styles.card}>
                <div className={styles.cardRow}>
                  <Text weight="semibold">{account.label}</Text>
                  {isActive && <Badge color="success" appearance="filled" size="small">Active</Badge>}
                </div>
                <div className={styles.cardRow}>
                  <Button
                    size="small"
                    appearance={isActive ? 'secondary' : 'primary'}
                    onClick={async () => {
                      if (isActive) {
                        await setActiveDataSource({ type: 'own' });
                      } else {
                        await setActiveDataSource({
                          type: 'shared',
                          accountId: account.id,
                          shareUrl: account.shareUrl,
                          label: account.label,
                          driveId: account.driveId,
                          itemId: account.itemId,
                        });
                      }
                    }}
                  >
                    {isActive ? 'Switch to My Data' : 'Switch to This'}
                  </Button>
                  <Button
                    icon={<Delete24Regular />}
                    size="small"
                    appearance="subtle"
                    onClick={async () => {
                      try {
                        await removeSharedAccount(account.id);
                      } catch (e) {
                        console.error('Failed to remove account:', e);
                      }
                    }}
                  />
                </div>
              </Card>
            );
          })
        )}
      </div>

      {showAddShared && (
        <Dialog open onOpenChange={(_, d) => { if (!d.open) { setShowAddShared(false); setShareLabel(''); setShareUrl(''); } }}>
          <DialogSurface style={isMobile ? { width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0 } : {}}>
            <DialogTitle>Add Shared Account</DialogTitle>
            <DialogBody>
              <Field label="Label" required>
                <Input value={shareLabel} onChange={(_, d) => setShareLabel(d.value)} placeholder="e.g., Alice's Properties" />
              </Field>
              <Field label="Invite Link" required>
                <Input value={shareUrl} onChange={(_, d) => setShareUrl(d.value)} placeholder="Paste the invite link" />
              </Field>
            </DialogBody>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setShowAddShared(false); setShareLabel(''); setShareUrl(''); }}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={!shareLabel || !shareUrl}
                onClick={async () => {
                  // Extract sharing params from the invite link
                  const params = new URLSearchParams(shareUrl.split('?')[1] || '');
                  const msShareUrl = params.get('shareUrl') || shareUrl;
                  const msDriveId = params.get('driveId') || undefined;
                  const msItemId = params.get('itemId') || undefined;
                  try {
                    await addSharedAccount(shareLabel, msShareUrl, msDriveId, msItemId);
                    // Register as linked user so the owner can see us (best-effort)
                    const newAccount = useStore.getState().sharingConfig.sharedAccounts.find((a) => a.shareUrl === msShareUrl);
                    if (newAccount) {
                      try {
                        await registerAsLinkedUser({
                          type: 'shared',
                          accountId: newAccount.id,
                          shareUrl: newAccount.shareUrl,
                          label: newAccount.label,
                          driveId: newAccount.driveId,
                          itemId: newAccount.itemId,
                        });
                      } catch {
                        // Non-critical — don't block if registration fails
                      }
                    }
                    setShowAddShared(false);
                    setShareLabel('');
                    setShareUrl('');
                  } catch (e) {
                    alert(`Failed to add account: ${e instanceof Error ? e.message : 'Invalid share link'}`);
                  }
                }}
              >
                Add
              </Button>
            </DialogActions>
          </DialogSurface>
        </Dialog>
      )}

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
                    await syncAfterConfigChange();
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
                      await syncAfterConfigChange();
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
            await syncAfterConfigChange();
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
            <Input type="number" value={String(amount)} onChange={(_, d) => setAmount(Math.max(0, Number(d.value) || 0))} />
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
