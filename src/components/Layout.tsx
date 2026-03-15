import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Tab,
  TabList,
  Text,
  Button,
  Divider,
  Badge,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuItemRadio,
  MessageBar,
  MessageBarBody,
  shorthands,
} from '@fluentui/react-components';
import type { MenuProps } from '@fluentui/react-components';
import {
  Home24Regular,
  Home24Filled,
  Building24Regular,
  Building24Filled,
  Money24Regular,
  Money24Filled,
  Receipt24Regular,
  Receipt24Filled,
  DataBarVertical24Regular,
  DataBarVertical24Filled,
  Settings24Regular,
  Settings24Filled,
  PeopleSwap24Regular,
} from '@fluentui/react-icons';
import { useIsMobile } from '../hooks/useIsMobile';
import { useStore } from '../store/useStore';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.padding('0', '16px'),
    height: '48px',
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '200px',
    ...shorthands.borderRight('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground2,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflow: 'auto',
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  contentMobile: {
    flex: 1,
    overflow: 'auto',
    ...shorthands.padding('16px'),
    paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
    zIndex: 1000,
  },
  bottomTab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    minWidth: '44px',
    minHeight: '44px',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase100,
    ...shorthands.padding('4px', '8px'),
  },
  bottomTabActive: {
    color: tokens.colorBrandForeground1,
  },
  syncBadge: {
    marginLeft: '4px',
  },
});

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', Icon: Home24Regular, IconFilled: Home24Filled },
  { path: '/properties', label: 'Properties', Icon: Building24Regular, IconFilled: Building24Filled },
  { path: '/income', label: 'Income', Icon: Money24Regular, IconFilled: Money24Filled },
  { path: '/expenses', label: 'Expenses', Icon: Receipt24Regular, IconFilled: Receipt24Filled },
  { path: '/reports', label: 'Reports', Icon: DataBarVertical24Regular, IconFilled: DataBarVertical24Filled },
  { path: '/settings', label: 'Settings', Icon: Settings24Regular, IconFilled: Settings24Filled },
];

const MOBILE_TABS = [
  { path: '/', label: 'Home', Icon: Home24Regular, IconFilled: Home24Filled },
  { path: '/properties', label: 'Props', Icon: Building24Regular, IconFilled: Building24Filled },
  { path: '/income', label: 'Income', Icon: Money24Regular, IconFilled: Money24Filled },
  { path: '/expenses', label: 'Expenses', Icon: Receipt24Regular, IconFilled: Receipt24Filled },
  { path: '/settings', label: 'More', Icon: Settings24Regular, IconFilled: Settings24Filled },
];

export function Layout() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isSyncing, user, activeDataSource, sharingConfig, setActiveDataSource } = useStore();

  const currentPath = '/' + (location.pathname.split('/')[1] || '');

  const sharedAccounts = sharingConfig.sharedAccounts;
  const hasMultipleAccounts = sharedAccounts.length > 0;

  const activeLabel = activeDataSource.type === 'own'
    ? 'My Data'
    : activeDataSource.label;

  const handleAccountSwitch: MenuProps['onCheckedValueChange'] = async (_, data) => {
    const selected = data.checkedItems[0];
    if (selected === 'own') {
      await setActiveDataSource({ type: 'own' });
    } else {
      const account = sharedAccounts.find((a) => a.id === selected);
      if (account) {
        await setActiveDataSource({
          type: 'shared',
          accountId: account.id,
          driveId: account.driveId,
          itemId: account.itemId,
          label: account.label,
        });
      }
    }
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Text className={styles.headerTitle}>RentalTracker</Text>
        <div className={styles.headerRight}>
          {isSyncing && (
            <Badge className={styles.syncBadge} appearance="outline" color="informative" size="small">
              Syncing...
            </Badge>
          )}
          {hasMultipleAccounts && (
            <Menu
              checkedValues={{ account: [activeDataSource.type === 'own' ? 'own' : activeDataSource.accountId] }}
              onCheckedValueChange={handleAccountSwitch}
            >
              <MenuTrigger disableButtonEnhancement>
                <Button icon={<PeopleSwap24Regular />} size="small" appearance="subtle">
                  {!isMobile && activeLabel}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItemRadio name="account" value="own">My Data</MenuItemRadio>
                  {sharedAccounts.map((a) => (
                    <MenuItemRadio key={a.id} name="account" value={a.id}>
                      {a.label}
                    </MenuItemRadio>
                  ))}
                  <MenuItem onClick={() => navigate('/settings')}>Manage accounts...</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
          {user && (
            <Text size={200}>{user.name || user.username}</Text>
          )}
        </div>
      </header>

      {activeDataSource.type === 'shared' && (
        <MessageBar intent="info" style={{ flexShrink: 0 }}>
          <MessageBarBody>Viewing shared data: {activeDataSource.label}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.body}>
        {!isMobile && (
          <nav className={styles.sidebar}>
            <TabList
              vertical
              selectedValue={currentPath}
              onTabSelect={(_, data) => navigate(data.value as string)}
            >
              {NAV_ITEMS.map((item) => (
                <Tab
                  key={item.path}
                  value={item.path}
                  icon={currentPath === item.path ? <item.IconFilled /> : <item.Icon />}
                >
                  {item.label}
                </Tab>
              ))}
            </TabList>
            <div style={{ flex: 1 }} />
            <Divider />
          </nav>
        )}

        <main className={isMobile ? styles.contentMobile : styles.content}>
          <Outlet />
        </main>
      </div>

      {isMobile && (
        <nav className={styles.bottomBar}>
          {MOBILE_TABS.map((item) => {
            const isActive = currentPath === item.path;
            return (
              <Button
                key={item.path}
                className={`${styles.bottomTab} ${isActive ? styles.bottomTabActive : ''}`}
                appearance="transparent"
                onClick={() => navigate(item.path)}
              >
                {isActive ? <item.IconFilled /> : <item.Icon />}
                <span>{item.label}</span>
              </Button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
