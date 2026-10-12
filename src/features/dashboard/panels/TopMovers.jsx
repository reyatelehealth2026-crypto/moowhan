import { useMemo, useState } from 'react';
import { topMovers } from '../../../lib/analytics/movers.js';
import { partLabel, th } from '../../../lib/analytics/labels.js';
import { formatNumber } from '../../../utils/format.js';

const KEYS = ['n', 'n1', 'n2', 'n3'];
const chip = (on) => `px-3 py-1.5 rounded-lg text-sm border min-h-[44px] ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`;
const signed = (n) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;

function List({ title, items, tone, aliases }) {
  return (
    <div className="min-w-0">
      <h4 className={`text-sm font-semibold mb-2 ${tone}`}>{title}</h4>
      {items.length === 0 ? <p className="text-sm text-slate-500">ไม่มีรายการ</p> : (
        <ul className="space-y-1.5">
          {items.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-1.5">
              <span className="font-mono truncate" title={m.key}>{m.dock !== undefined ? `${partLabel(m.partNumber, aliases)} · ${m.plant} · ${m.dock || '-'}` : partLabel(m.partNumber, aliases)}</span>
              <span className="num whitespace-nowrap">{signed(m.diff)} <span className="text-slate-500">({m.pct == null ? th.isNew : `${m.pct > 0 ? '+' : ''}${m.pct.toFixed(1)}%`})</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TopMovers({ summaryData, processedData, monthLabels, aliases }) {
  const [pair, setPair] = useState(['n', 'n1']);
  const [level, setLevel] = useState('part');
  const [from, to] = pair;
  const { up, down } = useMemo(
    () => topMovers(summaryData, from, to, 5, { level, processedData }),
    [summaryData, processedData, from, to, level],
  );
  const pairs = [[0, 1], [1, 2], [2, 3]];
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
      <h3 className="text-lg font-semibold">รายการที่ขยับมากสุด</h3>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="เทียบเดือน" value={pair.join('>')} onChange={(e) => setPair(e.target.value.split('>'))} className="border border-slate-300 rounded-lg px-2 py-2 bg-white min-h-[44px]">
          {pairs.map(([a, b]) => <option key={a} value={`${KEYS[a]}>${KEYS[b]}`}>{monthLabels[a] || th[KEYS[a]]} → {monthLabels[b] || th[KEYS[b]]}</option>)}
        </select>
        <div className="flex gap-2" role="group" aria-label="ระดับ">
          <button type="button" aria-pressed={level === 'part'} onClick={() => setLevel('part')} className={chip(level === 'part')}>ตาม Part</button>
          <button type="button" aria-pressed={level === 'row'} onClick={() => setLevel('row')} className={chip(level === 'row')}>ตาม Part|โรงงาน|Dock</button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <List title="เพิ่มขึ้นมากสุด" items={up} tone="text-emerald-700" aliases={aliases} />
        <List title="ลดลงมากสุด" items={down} tone="text-red-700" aliases={aliases} />
      </div>
    </section>
  );
}
