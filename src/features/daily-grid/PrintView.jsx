import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PLANTS } from '../../constants.js';
import { buildDayColumns } from '../../utils/calendar.js';
import { formatDate, formatNumber } from '../../utils/format.js';
import { buildPrintSections } from './print.js';

const cell = (v) => (v ? formatNumber(v) : '');

/** Print overlay (portal). index.css hides the app while printing and keeps only .print-overlay. */
export default function PrintView({ processedData, monthLabels, productionMonth, sourceFiles, onClose, initialMonth = 0, initialPlant = 'ALL' }) {
  const [plant, setPlant] = useState(initialPlant);
  const [month, setMonth] = useState(initialMonth);
  const [groupByDock, setGroupByDock] = useState(true);
  const [includeZero, setIncludeZero] = useState(false);
  const sections = useMemo(() => buildPrintSections(processedData, { plant, groupByDock, month, includeZero }), [processedData, plant, groupByDock, month, includeZero]);
  const dayCols = useMemo(() => buildDayColumns(productionMonth)[month], [productionMonth, month]);
  const printedAt = formatDate(new Date().toISOString(), 'long');
  const metaOf = (pl) => sourceFiles?.find((f) => f.category === pl && f.meta)?.meta || {};

  return createPortal(
    <div className="print-overlay fixed inset-0 z-[60] bg-white overflow-auto" role="dialog" aria-label="พิมพ์แผนรายวัน">
      <div className="no-print sticky top-0 z-10 bg-white border-b border-slate-200 p-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">โรงงาน
          <select value={plant} onChange={(e) => setPlant(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5">
            <option value="ALL">ทุกโรงงาน</option>
            {PLANTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">เดือน
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5">
            {monthLabels.map((l, i) => <option key={l} value={i}>{l}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={groupByDock} onChange={(e) => setGroupByDock(e.target.checked)} />แยกตาม Dock</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />รวมแถวที่เป็น 0 ทั้งเดือน</label>
        <span className="flex-1" />
        <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">พิมพ์</button>
        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg">ปิด</button>
      </div>

      <div className="p-3 sm:p-6">
        {sections.length === 0 && <p className="no-print text-slate-500 py-10 text-center">ไม่มีข้อมูลที่จะพิมพ์ในตัวเลือกนี้ ลองเลือกเดือนหรือโรงงานอื่น หรือติ๊ก “รวมแถวที่เป็น 0 ทั้งเดือน”</p>}
        {sections.map((s, idx) => {
          const meta = metaOf(s.plant);
          return (
            <section key={s.title} className={`print-section mb-8 ${idx > 0 ? 'print-break' : ''}`}>
              <div className="print-head mb-2 text-sm">
                <p className="font-bold text-base">แผนการผลิตรายวัน · {s.title}</p>
                <p className="text-slate-600">
                  เดือน {monthLabels[month]} · ISSUE DATE {meta.issueDate || '-'} · Rev {meta.revision || '-'} · พิมพ์เมื่อ {printedAt}
                </p>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="print-table border-collapse text-xs tabular-nums w-full">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 bg-slate-100 px-1 py-0.5 text-left">Part Number</th>
                      {dayCols.map((d) => (
                        <th key={d.day} className={`border border-slate-300 px-0.5 py-0.5 ${d.exists ? (d.isWeekend ? 'bg-slate-300' : 'bg-slate-100') : 'bg-slate-200 text-slate-300'}`}>{d.day}</th>
                      ))}
                      <th className="border border-slate-300 bg-slate-100 px-1 py-0.5">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r, i) => (
                      <tr key={`${r.partNumber}-${i}`}>
                        <td className="border border-slate-300 px-1 py-0.5 whitespace-nowrap">{r.partNumber}</td>
                        {r.days.map((v, di) => <td key={di} className={`border border-slate-300 px-0.5 py-0.5 text-right ${dayCols[di].exists ? (dayCols[di].isWeekend ? 'bg-slate-200' : '') : 'bg-slate-200'}`}>{cell(v)}</td>)}
                        <td className="border border-slate-300 px-1 py-0.5 text-right font-semibold">{formatNumber(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-slate-100">
                      <td className="border border-slate-300 px-1 py-0.5">รวม</td>
                      {s.days.map((v, di) => <td key={di} className="border border-slate-300 px-0.5 py-0.5 text-right">{cell(v)}</td>)}
                      <td className="border border-slate-300 px-1 py-0.5 text-right">{formatNumber(s.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
