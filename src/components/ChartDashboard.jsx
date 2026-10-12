import { useMemo, useState } from 'react';
import Icons from './Icons.jsx';
import Modal from './Modal.jsx';
import { MONTH_KEYS, MONTH_META, PLANT_META } from '../constants.js';
import { computeTotals, totalsByPlant } from '../lib/excel/aggregate.js';
import { formatNumber } from '../utils/format.js';

// ==================== CHART DASHBOARD ====================
// Lightweight SVG/CSS charts (no chart library): monthly bars, plant share, trend.
export default function ChartDashboard({ data, summaryData, monthLabels, onClose }) {
  const [activeChart, setActiveChart] = useState('bar');
  const totals = useMemo(() => computeTotals(summaryData), [summaryData]);
  const plantData = useMemo(() => totalsByPlant(data).filter((p) => p.total > 0), [data]);
  const grandTotal = plantData.reduce((sum, p) => sum + p.total, 0);
  const maxValue = Math.max(...MONTH_KEYS.map((k) => totals[k]), 1);

  const BarChart = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-800">ยอดรวมรายเดือน</h3>
      <div className="space-y-4">
        {MONTH_META.map((m, i) => {
          const value = totals[m.key];
          return (
            <div key={m.key} className="flex items-center gap-4">
              <span className="w-24 text-sm text-slate-600 truncate" title={monthLabels[i]}>{monthLabels[i]}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-8 overflow-hidden">
                <div
                  className={`h-full ${m.bar} rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                  style={{ width: `${(value / maxValue) * 100}%` }}
                >
                  {value > maxValue * 0.15 && <span className="text-white text-sm font-medium">{formatNumber(value)}</span>}
                </div>
              </div>
              <span className={`w-24 text-right font-semibold ${m.text}`}>{formatNumber(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const PieChart = () => {
    let prevAngle = 0;
    const slices = plantData.map((item) => {
      const angle = grandTotal ? (item.total / grandTotal) * 360 : 0;
      const startAngle = prevAngle;
      const endAngle = startAngle + angle;
      prevAngle = endAngle;
      const toXY = (deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        return [100 + 80 * Math.cos(rad), 100 + 80 * Math.sin(rad)];
      };
      const [x1, y1] = toXY(startAngle);
      const [x2, y2] = toXY(endAngle);
      // a single full-circle arc cannot be drawn with one A command
      const path = angle >= 359.99
        ? 'M 100 20 A 80 80 0 1 1 99.99 20 Z'
        : `M 100 100 L ${x1} ${y1} A 80 80 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
      return { ...item, path };
    });

    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-slate-800">สัดส่วนรายโรงงาน</h3>
        {grandTotal === 0 ? (
          <p className="text-slate-500 text-center py-10">ยังไม่มีข้อมูล</p>
        ) : (
          <div className="flex items-center justify-center">
            <svg viewBox="0 0 200 200" className="w-64 h-64" role="img" aria-label="สัดส่วนรายโรงงาน">
              {slices.map((s) => (
                <path key={s.plant} d={s.path} fill={PLANT_META[s.plant]?.color || '#94a3b8'} stroke="white" strokeWidth="2">
                  <title>{`${s.plant}: ${formatNumber(s.total)} (${((s.total / grandTotal) * 100).toFixed(1)}%)`}</title>
                </path>
              ))}
              <circle cx="100" cy="100" r="40" fill="white" />
              <text x="100" y="95" textAnchor="middle" className="text-sm fill-slate-600">Total</text>
              <text x="100" y="115" textAnchor="middle" className="text-lg font-bold fill-slate-800">{formatNumber(grandTotal)}</text>
            </svg>
          </div>
        )}
        <div className="flex flex-wrap gap-3 justify-center">
          {plantData.map((item) => (
            <div key={item.plant} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: PLANT_META[item.plant]?.color }} />
              <span className="text-sm text-slate-600">
                {item.plant}: {formatNumber(item.total)} ({grandTotal ? ((item.total / grandTotal) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const TrendChart = () => {
    const values = MONTH_KEYS.map((k) => totals[k]);
    const maxVal = Math.max(...values, 1);
    const points = values.map((v, i) => ({ x: 50 + i * 133, y: 200 - (v / maxVal) * 150 }));
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-slate-800">แนวโน้มการผลิต</h3>
        <svg viewBox="0 0 500 250" className="w-full h-64" role="img" aria-label="แนวโน้มการผลิต">
          {[0, 50, 100, 150, 200].map((y) => (
            <line key={y} x1="50" y1={y + 50} x2="450" y2={y + 50} stroke="#E2E8F0" strokeWidth="1" />
          ))}
          <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#3B82F6" strokeWidth="3" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="6" fill="#3B82F6" stroke="white" strokeWidth="2" />
              <text x={p.x} y={p.y - 15} textAnchor="middle" className="text-sm fill-slate-700 font-medium">{formatNumber(values[i])}</text>
              <text x={p.x} y={230} textAnchor="middle" className="text-xs fill-slate-500">{monthLabels[i]}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  const CHARTS = [
    { id: 'bar', label: 'แท่ง', Icon: Icons.Chart },
    { id: 'pie', label: 'วงกลม', Icon: Icons.PieChart },
    { id: 'trend', label: 'เส้น', Icon: Icons.Chart },
  ];

  return (
    <Modal onClose={onClose} className="max-w-4xl max-h-[90vh]" label="วิเคราะห์ข้อมูล">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white"><Icons.PieChart /></div>
          <h2 className="text-white font-semibold text-lg">วิเคราะห์ข้อมูล (Charts)</h2>
        </div>
        <button onClick={onClose} className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-lg text-white" aria-label="ปิด">✕</button>
      </div>

      <div className="flex gap-2 p-4 border-b border-slate-200">
        {CHARTS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveChart(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeChart === id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <span className="w-4 h-4"><Icon /></span>{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeChart === 'bar' && <BarChart />}
        {activeChart === 'pie' && <PieChart />}
        {activeChart === 'trend' && <TrendChart />}
      </div>
    </Modal>
  );
}
