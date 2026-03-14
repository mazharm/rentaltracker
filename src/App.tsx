import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  FluentProvider,
  webLightTheme,
  webDarkTheme,
  makeStyles,
  Button,
  Text,
  Card,
  shorthands,
  tokens,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
} from '@fluentui/react-components';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Properties } from './pages/Properties';
import { Income } from './pages/Income';
import { Expenses } from './pages/Expenses';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { useStore } from './store/useStore';
import { loginRequest } from './auth/msalConfig';

const useStyles = makeStyles({
  landing: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  landingCard: {
    ...shorthands.padding('40px'),
    textAlign: 'center',
    maxWidth: '400px',
    width: '90%',
  },
  landingTitle: {
    marginBottom: '8px',
  },
  landingDesc: {
    marginBottom: '24px',
    color: tokens.colorNeutralForeground3,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
  },
  errorBar: {
    position: 'fixed',
    top: '48px',
    left: 0,
    right: 0,
    zIndex: 2000,
  },
});

function usePrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function AppContent() {
  const styles = useStyles();
  const isAuthenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();
  const { setAuth, loadFromOneDrive, loadSharingConfig, isLoading, error, clearError } = useStore();

  useEffect(() => {
    const accounts = instance.getAllAccounts();
    if (accounts.length > 0) {
      setAuth(true, accounts[0]);
    }
  }, [instance, setAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      const accounts = instance.getAllAccounts();
      setAuth(true, accounts[0] ?? null);
      loadSharingConfig().then(() => loadFromOneDrive());
    }
  }, [isAuthenticated, instance, setAuth, loadSharingConfig, loadFromOneDrive]);

  if (inProgress !== InteractionStatus.None) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Signing in..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading data from OneDrive..." />
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className={styles.errorBar}>
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
            <MessageBarActions>
              <Button size="small" onClick={clearError}>Dismiss</Button>
            </MessageBarActions>
          </MessageBar>
        </div>
      )}
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="properties" element={<Properties />} />
            <Route path="income" element={<Income />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </>
  );
}

function LandingPage() {
  const styles = useStyles();
  const { instance } = useMsal();

  const handleSignIn = async () => {
    try {
      await instance.loginPopup(loginRequest);
    } catch (e) {
      console.error('Sign-in failed:', e);
    }
  };

  return (
    <div className={styles.landing}>
      <Card className={styles.landingCard}>
        <Text as="h1" size={700} weight="bold" block className={styles.landingTitle}>
          RentalTracker
        </Text>
        <Text block className={styles.landingDesc}>
          Track rental income and expenses across all your properties.
          Schedule E aligned P&L reporting with OneDrive-backed storage.
        </Text>
        <Button appearance="primary" size="large" onClick={handleSignIn}>
          Sign in with Microsoft
        </Button>
      </Card>
    </div>
  );
}

export default function App() {
  const isDark = usePrefersDark();

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      <AppContent />
    </FluentProvider>
  );
}
