import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Button,
  Input,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
  shorthands,
} from '@fluentui/react-components';
import { useStore } from '../store/useStore';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  },
  card: {
    ...shorthands.padding('32px'),
    maxWidth: '440px',
    width: '90%',
    textAlign: 'center',
  },
  field: {
    marginTop: '16px',
    textAlign: 'left',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    marginTop: '24px',
  },
  success: {
    color: tokens.colorPaletteGreenForeground1,
    marginTop: '16px',
  },
});

export function ShareInvite() {
  const styles = useStyles();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addSharedAccount, setActiveDataSource, registerAsLinkedUser, sharingConfig } = useStore();

  const encodedLink = searchParams.get('link');
  const oneDriveLink = encodedLink ? decodeURIComponent(encodedLink) : '';

  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Check if this link is already added
  const alreadyAdded = sharingConfig.sharedAccounts.some((a) => a.sharingUrl === oneDriveLink);

  useEffect(() => {
    if (alreadyAdded) {
      setDone(true);
    }
  }, [alreadyAdded]);

  if (!oneDriveLink) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <Text size={500} weight="semibold" block>Invalid Share Link</Text>
          <Text block style={{ marginTop: 8 }}>No share link was provided in the URL.</Text>
          <div className={styles.actions}>
            <Button appearance="primary" onClick={() => navigate('/')}>Go to Dashboard</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <Text size={500} weight="semibold" block>Shared Account Added</Text>
          <Text block style={{ marginTop: 8 }}>
            You can now switch to this account using the account switcher in the header.
          </Text>
          <div className={styles.actions}>
            <Button appearance="primary" onClick={() => navigate('/')}>Go to Dashboard</Button>
          </div>
        </Card>
      </div>
    );
  }

  const handleAdd = async () => {
    if (!label.trim()) return;
    setAdding(true);
    setError('');
    try {
      await addSharedAccount(label.trim(), oneDriveLink);
      // Switch to the newly added account
      const newAccount = useStore.getState().sharingConfig.sharedAccounts.find((a) => a.sharingUrl === oneDriveLink);
      if (newAccount) {
        const source = {
          type: 'shared' as const,
          accountId: newAccount.id,
          sharingUrl: newAccount.sharingUrl,
          label: newAccount.label,
        };
        // Register this user in the owner's linked_users.json
        await registerAsLinkedUser(source);
        await setActiveDataSource(source);
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add shared account');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <Text size={500} weight="semibold" block>You've Been Invited</Text>
        <Text block style={{ marginTop: 8 }}>
          Someone has shared their RentalTracker data with you. Give it a name to add it to your account.
        </Text>

        {error && (
          <MessageBar intent="error" style={{ marginTop: 12 }}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.field}>
          <Field label="Account Name" required>
            <Input
              value={label}
              onChange={(_, d) => setLabel(d.value)}
              placeholder="e.g., Alice's Properties"
              disabled={adding}
            />
          </Field>
        </div>

        <div className={styles.actions}>
          <Button appearance="secondary" onClick={() => navigate('/')} disabled={adding}>
            Skip
          </Button>
          <Button appearance="primary" onClick={handleAdd} disabled={!label.trim() || adding}>
            {adding ? <Spinner size="tiny" /> : 'Accept & View Data'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
