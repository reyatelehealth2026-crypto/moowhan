import { useMemo } from 'react';
import Icons from './Icons.jsx';
import { MONTH_META, PLANT_META } from '../constants.js';
import { formatNumber } from '../utils/format.js';
import HorizonBadge from '../features/qa-file-guards/HorizonBadge.jsx';
import useAnalytics from '../hooks/useAnalytics.js';
import ShareButton from '../features/share-clipboard/ShareButton.jsx';
import CopyButton from './CopyButton.jsx';
import { DataGrid, KpiCard, Button, STRINGS, GLOSSARY } from '../features/ui-kit/index.js';
import GlossaryTip from '../features/help-center/GlossaryTip.jsx';
import { COLUMN_TIPS } from '../features/help-center/columns.js';

const total = (r) => r.n + r.n1 + r.n2 + r.n3;

// ==================== SUMMARY TAB ("สรุปรวม") ====================
export default function SummaryTab({ state, actions, monthLabels }) {
  const { summaryData, exporting } = state;
  const totals = useAnalytics(state.processedData, summaryData, state.sourceFiles)?.kpis.totals ?? state.totals;

  const columns = useMemo(() => [
    { key: 'partNumber', label: GLOSSARY.partNumber, className: 'font-mono text-blue-600' },
    {
      key: 'plants', label: 'Plants', tip: <GlossaryTip glossaryKey={COLUMN_TIPS.plants} label="อธิบาย Plants" />,
      render: (r) => (
        <div className="flex gap-1">
          {r.plants.split(', ').map((p) => <span key={p} className={`px-2 py-0.5 rounded text-xs ${PLANT_META[p]?.badge}`}>{p}</span>)}
        </div>
      ),
    },
    ...['n', 'n1', 'n2', 'n3'].map((k, i) => ({ key: k, label: <>{monthLabels[i] || GLOSSARY[k]}<HorizonBadge k={k} sourceFiles={state.sourceFiles} /></>, num: true })),
    { key: 'total', label: 'Total', num: true, value: total, className: 'font-bold' },
  ], [monthLabels, state.sourceFiles]);

  const footer = (rows) => {
    const sum = rows.reduce((a, r) => ({ n: a.n + r.n, n1: a.n1 + r.n1, n2: a.n2 + r.n2, n3: a.n3 + r.n3 }), { n: 0, n1: 0, n2: 0, n3: 0 });
    return { ...sum, total: sum.n + sum.n1 + sum.n2 + sum.n3 };
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {MONTH_META.map((m, i) => (
          <div key={m.key} className={`bg-gradient-to-br ${m.gradient} rounded-2xl p-4 sm:p-5 text-white shadow-lg`}>
            <p className="text-white/80 text-sm">{monthLabels[i]}{i === 0 && <HorizonBadge k="n" sourceFiles={state.sourceFiles} />}</p>
            <p className="num text-2xl sm:text-3xl font-bold">{formatNumber(totals[m.key])}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Button size="lg" onClick={() => actions.goTo('dashboard')} Icon={Icons.PieChart} className="flex-1 !bg-gradient-to-r from-purple-600 to-pink-600">ดูกราฟวิเคราะห์</Button>
        <Button size="lg" variant="secondary" onClick={actions.openPreview} Icon={Icons.Eye} className="flex-1 !border-2 !border-blue-600 !text-blue-600" data-testid="preview-excel-summary">{STRINGS.buttons.previewExcel}</Button>
        <ShareButton state={state} actions={actions} monthLabels={monthLabels} className="flex-1" />
        <Button size="lg" onClick={() => actions.exportExcel()} loading={exporting} Icon={Icons.Download} className="flex-1" data-testid="download">
          {exporting ? STRINGS.status.exporting : STRINGS.buttons.download}
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">สรุปยอดรวม ({(summaryData || []).length} รายการ)</h3>
          <CopyButton
            label="คัดลอกตาราง" size="sm" disabled={!summaryData?.length} data-testid="summary-copy"
            getRows={() => {
              const rows = (summaryData || []).map((r) => [r.partNumber, r.plants, r.n, r.n1, r.n2, r.n3, total(r)]);
              const sum = footer(summaryData || []);
              return [['Part Number', 'Plants', ...monthLabels, 'Total'], ...rows, ['รวม', '', sum.n, sum.n1, sum.n2, sum.n3, sum.total]];
            }}
            onCopied={(res) => {
              actions.log({ fileName: '-', action: 'share', details: `คัดลอกตารางสรุป ${res.rows.length - 2} แถว` });
              actions.setNotice(res.ok ? `คัดลอก ${res.rows.length - 2} แถวแล้ว - วางลง Excel/Google Sheets ได้เลย` : 'เบราว์เซอร์ไม่อนุญาตให้คัดลอก — ลองกด "แชร์สรุป" > ตาราง TSV แล้วคัดลอกด้วยตนเอง', res.ok ? 'success' : 'warning');
            }}
          />
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
