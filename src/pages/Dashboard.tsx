import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  Text,
  Button,
  Badge,
  makeStyles,
  tokens,
  shorthands,
} from '@fluentui/react-components';
import {
  Add24Regular,
  Building24Regular,
  DataBarVertical24Regular,
} from '@fluentui/react-icons';
import { useStore } from '../store/useStore';
import { useIsMobile } from '../hooks/useIsMobile';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  gridMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px',
  },
  summaryCard: {
    ...shorthands.padding('16px'),
  },
  summaryValue: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
  },
  summaryLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  propertyCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '12px',
    marginBottom: '24px',
  },
  propertyCardsMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px',
  },
  propertyCard: {
    ...shorthands.padding('12px', '16px'),
    cursor: 'pointer',
  },
  propertyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    marginBottom: '12px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  emptyState: {
    ...shorthands.padding('24px'),
    textAlign: 'center',
    marginBottom: '24px',
  },
});

export function Dashboard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { config, yearData, currentYear } = useStore();

  const properties = config?.properties.filter((p) => p.status === 'active') ?? [];
  const data = yearData[currentYear];

  // Summary calculations
  const totalIncome = data?.rentEntries
    .filter((e) => e.year === currentYear && e.status !== 'vacant')
    .reduce((sum, e) => sum + e.actualAmount, 0) ?? 0;

  const totalExpenses = data?.expenseEntries
    .filter((e) => e.date.startsWith(`${currentYear}-`))
    .reduce((sum, e) => sum + e.amount, 0) ?? 0;

  const netIncome = totalIncome - totalExpenses;

  const totalMonths = properties.length * 12;
  const vacantMonths = data?.rentEntries
    .filter((e) => e.year === currentYear && e.status === 'vacant')
    .length ?? 0;
  const vacancyRate = totalMonths > 0 ? ((vacantMonths / totalMonths) * 100).toFixed(1) : '0.0';

  const summaryCards = [
    { label: 'Income YTD', value: `$${totalIncome.toLocaleString()}`, color: 'success' as const },
    { label: 'Expenses YTD', value: `$${totalExpenses.toLocaleString()}`, color: 'danger' as const },
    { label: 'Net Income YTD', value: `$${netIncome.toLocaleString()}`, color: netIncome >= 0 ? 'success' as const : 'danger' as const },
    { label: 'Vacancy Rate', value: `${vacancyRate}%`, color: vacantMonths > 0 ? 'warning' as const : 'success' as const },
  ];

  return (
    <div>
      <Text as="h1" size={600} weight="semibold" block className={styles.sectionTitle}>
        Dashboard — {currentYear}
      </Text>

      <div className={isMobile ? styles.gridMobile : styles.grid}>
        {summaryCards.map((card) => (
          <Card key={card.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
          </Card>
        ))}
      </div>

      <div className={styles.sectionHeader}>
        <Text as="h2" size={400} weight="semibold">Properties</Text>
        <Button icon={<Building24Regular />} size="small" onClick={() => navigate('/properties')}>
          Manage
        </Button>
      </div>

      {properties.length === 0 ? (
        <Card className={styles.emptyState}>
          <Text block weight="semibold">No properties yet</Text>
          <Text block size={200} style={{ marginBottom: 12 }}>
            Add your first rental property to start tracking income and expenses.
          </Text>
          <Button icon={<Add24Regular />} appearance="primary" onClick={() => navigate('/properties')}>
            Add Property
          </Button>
        </Card>
      ) : (
        <div className={isMobile ? styles.propertyCardsMobile : styles.propertyCards}>
          {properties.map((property) => {
            const lastEntry = data?.rentEntries
              .filter((e) => e.propertyId === property.id)
              .sort((a, b) => b.month - a.month)[0];

            return (
              <Card
                key={property.id}
                className={styles.propertyCard}
                onClick={() => navigate('/properties')}
              >
                <CardHeader
                  header={<Text weight="semibold">{property.name}</Text>}
                  description={<Text size={200}>${property.monthlyRent.toLocaleString()}/mo</Text>}
                  action={
                    <Badge color={property.status === 'active' ? 'success' : 'danger'} appearance="filled">
                      {property.status}
                    </Badge>
                  }
                />
                {lastEntry && (
                  <div className={styles.propertyRow}>
                    <Text size={200}>Last: {['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][lastEntry.month]}</Text>
                    <Badge size="small" color={lastEntry.status === 'received' ? 'success' : 'informative'}>
                      {lastEntry.status}
                    </Badge>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Text as="h2" size={400} weight="semibold" block className={styles.sectionTitle}>
        Quick Actions
      </Text>

      <div className={styles.actions}>
        <Button icon={<Add24Regular />} appearance="primary" onClick={() => navigate('/properties')}>
          Add Property
        </Button>
        <Button icon={<Add24Regular />} onClick={() => navigate('/expenses')}>
          Add Expense
        </Button>
        <Button icon={<DataBarVertical24Regular />} onClick={() => navigate('/reports')}>
          Generate Report
        </Button>
      </div>
    </div>
  );
}
