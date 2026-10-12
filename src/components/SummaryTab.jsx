import { useMemo } from 'react';
import Icons from './Icons.jsx';
import { MONTH_META, PLANT_META } from '../constants.js';
import { formatNumber } from '../utils/format.js';
import useAnalytics from '../hooks/useAnalytics.js';
import { DataGrid, KpiCard, Button, STRINGS, GLOSSARY } from '../features/ui-kit/index.js';

const total = (r) => r.n + r.n1 + r.n2 + r.n3;

// ==================== SUMMARY TAB ("สรุปรวม") ====================
export default function SummaryTab({ state, actions, monthLabels }) {
  const { summaryData, exporting } = state;
  const totals = useAnalytics(state.processedData, summaryData, state.sourceFiles)?.kpis.totals ?? state.totals;

  const columns = useMemo(() => [
    { key: 'partNumber', label: GLOSSARY.partNumber, className: 'font-mono text-blue-600' },
    {
      key: 'plants', label: 'Plants',
      render: (r) => (
        <div className="flex gap-1">
          {r.plants.split(', ').map((p) => <span key={p} className={`px-2 py-0.5 rounded text-xs ${PLANT_META[p]?.badge}`}>{p}</span>)}
        </div>
      ),
    },
    ...['n', 'n1', 'n2', 'n3'].map((k, i) => ({ key: k, label: monthLabels[i] || GLOSSARY[k], num: true })),
    { key: 'total', label: 'Total', num: true, value: total, className: 'font-bold' },
  ], [monthLabels]);

  const footer = (rows) => {
    const sum = rows.reduce((a, r) => ({ n: a.n + r.n, n1: a.n1 + r.n1, n2: a.n2 + r.n2, n3: a.n3 + r.n3 }), { n: 0, n1: 0, n2: 0, n3: 0 });
    return { ...sum, total: sum.n + sum.n1 + sum.n2 + sum.n3 };
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {MONTH_META.map((m, i) => (
          <div key={m.key} className={`bg-gradient-to-br ${m.gradient} rounded-2xl p-4 sm:p-5 text-white shadow-lg`}>
            <p className="text-white/80 text-sm">{monthLabels[i]}</p>
            <p className="num text-2xl sm:text-3xl font-bold">{formatNumber(totals[m.key])}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Button size="lg" onClick={() => actions.goTo('dashboard')} Icon={Icons.PieChart} className="flex-1 !bg-gradient-to-r from-purple-600 to-pink-600">ดูกราฟวิเคราะห์</Button>
        <Button size="lg" variant="secondary" onClick={actions.openPreview} Icon={Icons.Eye} className="flex-1 !border-2 !border-blue-600 !text-blue-600" data-testid="preview-excel-summary">{STRINGS.buttons.previewExcel}</Button>
        <Button size="lg" onClick={() => actions.exportExcel()} loading={exporting} Icon={Icons.Download} className="flex-1" data-testid="download">
          {exporting ? STRINGS.status.exporting : STRINGS.buttons.download}
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b bg-slate-50">
          <h3 className="font-semibold">สรุปยอดรวม ({(summaryData || []).length} รายการ)</h3>
        </div>
        <DataGrid
          testId="summary-grid"
          columns={columns}
          rows={summaryData || []}
          getKey={(r) => r.partNumber}
          searchFields={['partNumber', 'plants']}
          resetKey={summaryData}
          footer={footer}
          footerLabel={(rows) => `รวม (${rows.length} รายการ)`}
        />
      </div>
    </div>
  );
}
