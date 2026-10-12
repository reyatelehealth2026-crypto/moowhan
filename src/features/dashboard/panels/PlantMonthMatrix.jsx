import { MONTH_META, PLANT_META } from '../../../constants.js';
import { formatNumber } from '../../../utils/format.js';
import { th } from '../../../lib/analytics/labels.js';

function MonthBars({ totals, monthLabels }) {
  const max = Math.max(...MONTH_META.map((m) => totals[m.key]), 1);
  const W = 600; const rowH = 44; const left = 110; const right = 80;
  return (
    <svg viewBox={`0 0 ${W} ${rowH * 4}`} className="w-full h-auto" role="img" aria-label="กราฟแท่งรายเดือน">
      {MONTH_META.map((m, i) => {
        const w = ((W - left - right) * totals[m.key]) / max;
        const y = i * rowH;
        return (
          <g key={m.key}>
            <text x="0" y={y + 27} fontSize="13" fill="#475569">{monthLabels[i] || th[m.key]}</text>
            <rect x={left} y={y + 8} width={Math.max(w, 2)} height="26" rx="6" className={m.bar.replace('bg-', 'fill-')} />
            <text x={left + w + 8} y={y + 27} fontSize="13" fontWeight="600" fill="#0f172a">{formatNumber(totals[m.key])}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PlantMonthMatrix({ analytics, monthLabels }) {
  const { kpis, matrix } = analytics;
  const rows = [...matrix.rows, { plant: 'รวม', ...matrix.total, isTotal: true }];
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
      <h3 className="text-lg font-semibold">ยอดรวมรายเดือน</h3>
      <MonthBars totals={kpis.totals} monthLabels={monthLabels} />
      <div className="overflow-x-auto" data-testid="plant-matrix">
        <table className="w-full text-sm min-w-[32rem]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-2">โรงงาน</th>
              {MONTH_META.map((m, i) => <th key={m.key} className="py-2 px-2 text-right">{monthLabels[i] || th[m.key]}</th>)}
              <th className="py-2 px-2 text-right">รวม 4 เดือน</th>
              <th className="py-2 pl-2 text-right">สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plant} className={`border-b border-slate-100 ${r.isTotal ? 'font-bold bg-slate-50' : ''}`}>
                <td className="py-2 pr-2">
                  {r.isTotal ? r.plant : <span className={`px-2 py-0.5 rounded text-xs ${PLANT_META[r.plant].badge}`}>{r.plant}</span>}
                </td>
                {MONTH_META.map((m) => <td key={m.key} className="py-2 px-2 text-right num">{formatNumber(r[m.key])}</td>)}
                <td className="py-2 px-2 text-right num">{formatNumber(r.total)}</td>
                <td className="py-2 pl-2 text-right num">{r.share.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
