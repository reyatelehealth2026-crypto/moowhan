import { useMemo, useState } from 'react';
import { PLANT_META } from '../constants.js';
import { formatNumber } from '../utils/format.js';
import { DataGrid, STRINGS, GLOSSARY } from '../features/ui-kit/index.js';

// ==================== MATCHING TAB ====================
// Which plant files contributed to each part number (one expandable row per Part Number).
export default function MatchingTab({ state, monthLabels }) {
  const { matchingDetails } = state;
  const [onlyMulti, setOnlyMulti] = useState(false);

  const rows = useMemo(
    () => Object.entries(matchingDetails || {})
      .filter(([, d]) => !onlyMulti || d.plants.size > 1)
      .map(([partNumber, d]) => ({
        partNumber,
        sources: d.sources,
        plants: [...new Set(d.sources.map((s) => s.plant))].join(', '),
        count: d.sources.length,
        partCode: d.sources.map((s) => s.partCode).join(' '),
        dockCode: d.sources.map((s) => s.dockCode).join(' '),
        n: d.sources.reduce((a, s) => a + s.n, 0),
        n1: d.sources.reduce((a, s) => a + s.n1, 0),
        n2: d.sources.reduce((a, s) => a + s.n2, 0),
        n3: d.sources.reduce((a, s) => a + s.n3, 0),
      }))
      .sort((a, b) => a.partNumber.localeCompare(b.partNumber)),
    [matchingDetails, onlyMulti],
  );

  const columns = useMemo(() => [
    { key: 'partNumber', label: GLOSSARY.partNumber, className: 'font-mono text-blue-600 font-medium' },
    {
      key: 'plants', label: 'Plant',
      render: (r) => (
        <span className="flex gap-1">
          {r.plants.split(', ').map((p) => <span key={p} className={`px-2 py-0.5 rounded text-xs ${PLANT_META[p]?.badge || 'bg-gray-100 text-gray-700'}`}>{p}</span>)}
        </span>
      ),
    },
    { key: 'count', label: 'แหล่ง', num: true },
    ...['n', 'n1', 'n2', 'n3'].map((k, i) => ({ key: k, label: monthLabels[i] || GLOSSARY[k], num: true })),
  ], [monthLabels]);

  const detail = (row) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left py-1 pr-3">Plant</th>
            <th className="text-left pr-3">{GLOSSARY.partCode}</th>
            <th className="text-left pr-3">{GLOSSARY.dockCode}</th>
            {monthLabels.map((m) => <th key={m} className="text-right whitespace-nowrap px-2">{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {row.sources.map((s, i) => (
            <tr key={i} className="border-t border-slate-200">
              <td className="py-1.5 pr-3"><span className={`px-2 py-0.5 rounded ${PLANT_META[s.plant]?.badge || 'bg-gray-100 text-gray-700'}`}>{s.plant}</span></td>
              <td className="font-mono text-slate-600 pr-3">{s.partCode}</td>
              <td className="text-slate-500 pr-3">{s.dockCode}</td>
              {[s.n, s.n1, s.n2, s.n3].map((v, j) => <td key={j} className="num text-right px-2">{formatNumber(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-blue-800 text-sm">
          <span className="font-semibold">รายละเอียด Matching:</span> แสดงว่าแต่ละ Part Number ถูกดึงมาจากไฟล์ของโรงงานใดบ้าง (แถวซ้ำกันในโรงงานเดียวคือ Dock ต่างกัน) กดที่ Part Number เพื่อดูแต่ละแหล่ง
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b bg-slate-50 flex flex-wrap justify-between items-center gap-3">
          <h3 className="font-semibold">รายละเอียดการ Matching ({rows.length} Part Numbers)</h3>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={onlyMulti} onChange={(e) => setOnlyMulti(e.target.checked)} className="rounded" />
            เฉพาะที่มีหลายโรงงาน
          </label>
        </div>
        <DataGrid
          testId="matching-grid"
          columns={columns}
          rows={rows}
          getKey={(r) => r.partNumber}
          resetKey={matchingDetails}
          renderExpanded={detail}
          emptyMessage={STRINGS.empty.noData}
        />
      </div>
    </div>
  );
}
