import { partLabel } from '../../../lib/analytics/labels.js';
import { formatNumber } from '../../../utils/format.js';

export default function ParetoCard({ pareto, aliases }) {
  const top = pareto.items.slice(0, 10);
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 min-w-0">
      <h3 className="text-lg font-semibold">Pareto</h3>
      <p className="text-sm text-slate-600">
        Top 5 Part = <b className="num">{(pareto.top5Share * 100).toFixed(1)}%</b> ของยอดรวม 4 เดือน · ถึง 80% ที่ Part ลำดับ <b className="num">{pareto.countToReach(0.8)}</b> จาก {pareto.items.length}
      </p>
      <ul className="space-y-1.5">
        {top.map((p) => (
          <li key={p.partNumber} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-mono truncate">{p.rank}. {partLabel(p.partNumber, aliases)}</span>
              <span className="num whitespace-nowrap">{formatNumber(p.total)} · สะสม {(p.cumulative * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${p.cumulative * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
