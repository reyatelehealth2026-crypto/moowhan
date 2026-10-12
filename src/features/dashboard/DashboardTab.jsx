import { useState } from 'react';
import Icons from '../../components/Icons.jsx';
import useAnalytics from '../../hooks/useAnalytics.js';
import { Button, pushToast } from '../ui-kit/index.js';
import KpiStrip from './panels/KpiStrip.jsx';
import PlantMonthMatrix from './panels/PlantMonthMatrix.jsx';
import TopMovers from './panels/TopMovers.jsx';
import ParetoCard from './panels/ParetoCard.jsx';
import AttentionCard from './panels/AttentionCard.jsx';
import { buildReportModel, printReport, saveReportPng } from './report.js';

export default function DashboardTab({ state, monthLabels }) {
  const analytics = useAnalytics(state.processedData, state.summaryData, state.sourceFiles);
  const [saving, setSaving] = useState(false);
  if (!analytics) return null;
  const aliases = state.profile?.features?.aliases?.parts || {};

  const savePng = async () => {
    setSaving(true);
    try {
      await saveReportPng(buildReportModel(analytics, { monthLabels, productionMonth: state.productionMonth }), state.productionMonth);
      pushToast({ message: 'บันทึกรูปสรุปแล้ว', tone: 'success' });
    } catch (e) {
      pushToast({ message: `บันทึกรูปไม่สำเร็จ ${e.message || ''} ลองกดใหม่อีกครั้ง`, tone: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 min-w-0" data-testid="dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">แดชบอร์ด</h2>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" Icon={Icons.File} onClick={printReport} data-testid="dashboard-print">พิมพ์ / PDF</Button>
          <Button variant="secondary" Icon={Icons.Download} onClick={savePng} loading={saving} data-testid="dashboard-png">บันทึกเป็นรูป</Button>
        </div>
      </div>
      <KpiStrip kpis={analytics.kpis} />
      <PlantMonthMatrix analytics={analytics} monthLabels={monthLabels} />
      <div className="grid lg:grid-cols-2 gap-4">
        <TopMovers summaryData={state.summaryData} processedData={state.processedData} monthLabels={monthLabels} aliases={aliases} />
        <div className="space-y-4 min-w-0">
          <ParetoCard pareto={analytics.pareto} aliases={aliases} />
          <AttentionCard state={state} kpis={analytics.kpis} />
        </div>
      </div>
    </div>
  );
}
