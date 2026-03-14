import { useState } from 'react';
import {
  Text,
  Button,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
  makeStyles,
} from '@fluentui/react-components';
import { ArrowDownload24Regular } from '@fluentui/react-icons';
import { useStore } from '../store/useStore';
import { ReportTable } from '../components/ReportTable';
import { generateCSV } from '../engine/reportGenerator';
import { ScheduleEReport } from '../models/types';

const useStyles = makeStyles({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  controls: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  report: {
    marginTop: '16px',
  },
});

export function Reports() {
  const styles = useStyles();
  const { yearData, currentYear, generateReport } = useStore();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [report, setReport] = useState<ScheduleEReport | null>(null);

  const availableYears = Object.keys(yearData)
    .map(Number)
    .sort((a, b) => b - a);
  if (availableYears.length === 0) availableYears.push(currentYear);

  const handleGenerate = () => {
    const r = generateReport(selectedYear);
    setReport(r);
  };

  const handleDownloadCSV = () => {
    if (!report) return;
    const csv = generateCSV(report);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-e-${report.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className={styles.header}>
        <Text as="h1" size={600} weight="semibold">Reports</Text>
      </div>

      <div className={styles.controls}>
        <Dropdown
          value={String(selectedYear)}
          selectedOptions={[String(selectedYear)]}
          onOptionSelect={(_, d) => {
            setSelectedYear(Number(d.optionValue));
            setReport(null);
          }}
        >
          {availableYears.map((y) => (
            <Option key={y} value={String(y)}>{String(y)}</Option>
          ))}
        </Dropdown>

        <Button appearance="primary" onClick={handleGenerate}>
          Generate P&L
        </Button>

        {report && (
          <Button icon={<ArrowDownload24Regular />} onClick={handleDownloadCSV}>
            Download CSV
          </Button>
        )}
      </div>

      {report && (
        <div className={styles.report}>
          {report.properties.length === 0 ? (
            <MessageBar>
              <MessageBarBody>No data found for {selectedYear}.</MessageBarBody>
            </MessageBar>
          ) : (
            <ReportTable report={report} />
          )}
        </div>
      )}
    </div>
  );
}
