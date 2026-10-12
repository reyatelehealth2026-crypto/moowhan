import { formatNumber } from '../../utils/format.js';

const COLORS = { total: '#1d4ed8', BP: '#0ea5e9', BPK: '#10b981', GW: '#f59e0b', SR: '#8b5cf6' };
const W = 320; const H = 140; const PAD = { l: 8, r: 8, t: 10, b: 20 };

const fmtPct = (p) => (p == null ? '-' : `${p > 0 ? '+' : ''}${(p * 100).toFixed(1)}%`);

// Inline SVG line chart (viewBox-scaled, never wider than its container) + a small table of N and drift.
export default function TrendChart({ trend, showPlants = true }) {
  const { points, series, drift, plants } = trend;
  if (!points.length) return <p className="text-sm text-slate-500">ยังไม่มีประวัติ — ประมวลผลไฟล์เพื่อเริ่มบันทึก</p>;
  const lines = [['total', series.total], ...(showPlants ? plants.map((p) => [p, series.byPlant[p]]) : [])];
  const vals = lines.flatMap(([, s]) => s.map((d) => d.value).filter((v) => v != null));
  const max = Math.max(1, ...vals);
  const x = (i) => (points.length === 1 ? W / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  return (
    <div className="space-y-3" data-testid="trend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-full" role="img" aria-label="แนวโน้มยอด N รายเดือน">
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#cbd5e1" />
        {lines.map(([name, s]) => {
          const pts = s.map((d, i) => (d.value == null ? null : [x(i), y(d.value)]));
          const path = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
          return (
            <g key={name}>
              {pts.filter(Boolean).length > 1 && <path d={path} fill="none" stroke={COLORS[name]} strokeWidth={name === 'total' ? 2.5 : 1.5} />}
              {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={name === 'total' ? 3 : 2} fill={COLORS[name]} />)}
            </g>
          );
        })}
        {points.map((p, i) => <text key={p.month} x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="#64748b">{p.label}</text>)}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        {lines.map(([name]) => <span key={name} className="inline-flex items-center gap-1"><i className="inline-block w-3 h-1 rounded" style={{ background: COLORS[name] }} />{name === 'total' ? 'รวม' : name}</span>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1 pr-2">เดือน</th><th className="py-1 pr-2 text-right">N รวม</th><th className="py-1 text-right" title="N ของเดือนนี้ เทียบกับ N+3 ที่รอบก่อนหน้า 3 เดือนเคยให้ไว้">เปลี่ยนจาก N+3 เดิม</th></tr></thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.month} className="border-b border-slate-100">
                <td className="py-1 pr-2">{p.label}{p.signed && <span className="ml-1 text-emerald-700">✓</span>}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatNumber(p.total.n)}</td>
                <td className="py-1 text-right tabular-nums">{fmtPct(drift.total[i]?.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
