import {
  Text,
  Dropdown,
  Option,
  makeStyles,
} from '@fluentui/react-components';
import { RentGrid } from '../components/RentGrid';
import { useStore } from '../store/useStore';

const useStyles = makeStyles({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '8px',
  },
});

export function Income() {
  const styles = useStyles();
  const { currentYear, yearData } = useStore();

  const availableYears = Object.keys(yearData)
    .map(Number)
    .sort((a, b) => b - a);

  if (availableYears.length === 0) {
    availableYears.push(currentYear);
  }

  return (
    <div>
      <div className={styles.header}>
        <Text as="h1" size={600} weight="semibold">Income</Text>
        <Dropdown
          value={String(currentYear)}
          selectedOptions={[String(currentYear)]}
          onOptionSelect={(_, d) => {
            useStore.setState({ currentYear: Number(d.optionValue) });
          }}
        >
          {availableYears.map((y) => (
            <Option key={y} value={String(y)}>{String(y)}</Option>
          ))}
        </Dropdown>
      </div>
      <RentGrid />
    </div>
  );
}
