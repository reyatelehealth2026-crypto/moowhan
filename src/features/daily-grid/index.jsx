import { useMemo, useRef, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { PLANTS, PLANT_META } from '../../constants.js';
import { WEEKDAY_LABELS } from '../../utils/calendar.js';
import { formatNumber } from '../../utils/format.js';
import { buildDailyTotalAoa } from '../../lib/excel/daily.js';
import {
  PRESETS, VIEW_MODES, buildColumns, buildGridItems, cellValue, gridToAoa, isOver, loadSettings,
  overDays, plantKpis, saveSettings, sumItems, toTsv,
} from './views.js';
import useWindowedRows from './useWindowedRows.js';
import PrintView from './PrintView.jsx';

const ID = 'daily-grid';
const ROW_H = 28;
export const DAILY_TOTAL_SHEET = 'Daily Total';

/** Feature data in state.features, falling back to localStorage (try/catch inside loadSettings). */
const settingsOf = (ctx) => ctx.state.features?.[ID]?.settings ?? loadSettings();
const updateSettings = (ctx, patch) => {
  const next = { ...settingsOf(ctx), ...patch };
  saveSettings(next);
  ctx.actions.setFeatureData(ID, { settings: next });
};
const setPrint = (ctx, open) => ctx.actions.setFeatureData(ID, { printOpen: open });

// QA findings (qa-engine, when installed) are only displayed here, never computed: key = plant|part|dock
const findingsOf = (state) => {
  const f = state.features?.['qa-engine']?.findings;
  if (!Array.isArray(f) || !f.length) return null;
  const map = new Map();
  f.forEach((x) => {
    const key = x.key || `${x.plant}|${x.partNumber}|${x.dock ?? x.dockCode ?? ''}`;
    map.set(key, [...(map.get(key) || []), x]);
  });
  return map;
};

function Kpis({ processedData, monthIdx, label }) {
  const kpis = useMemo(() => plantKpis(processedData, monthIdx), [processedData, monthIdx]);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((k) => (
        <div key={k.plant} className={`rounded-xl border p-3 ${PLANT_META[k.plant].lightBg} ${PLANT_META[k.plant].border}`}>
          <p className="text-sm font-semibold">{k.plant} <span className="font-normal text-slate-500">· {label}</span></p>
          <p className="text-xs text-slate-600 mt-1">วันที่มีส่ง {k.shippingDays} วัน · เฉลี่ย {formatNumber(k.average)}/วัน</p>
          <p className="text-xs text-slate-600">{k.peak ? `วันพีค ที่ ${k.peakDay} (${formatNumber(k.peak)})` : 'ไม่มีการส่ง'}</p>
        </div>
      ))}
    </div>
  );
}

function Grid({ items, columns, view, capacity, dayCols, monthLabels, findings }) {
  const scrollRef = useRef(null);
  const win = useWindowedRows(scrollRef, items.length, { rowHeight: ROW_H });
  const foot = useMemo(() => sumItems(items), [items]);
  const months = [...new Set(columns.map((c) => c.monthIdx))];
  const cap = Number(capacity) || 0;
  const shade = (c) => (!c.exists ? 'bg-slate-200' : c.isWeekend ? 'bg-slate-100' : '');
  const num = 'px-1.5 text-right tabular-nums whitespace-nowrap border-b border-slate-100';

  return (
    <div ref={scrollRef} className="overflow-auto max-h-[70vh] border border-slate-200 rounded-xl bg-white" data-testid="daily-scroll">
      <table className="border-separate border-spacing-0 text-xs sm:text-sm">
        <thead>
          <tr style={{ height: ROW_H }}>
            <th rowSpan={2} className="sticky left-0 top-0 z-40 bg-slate-100 text-left px-2 min-w-[10.5rem] border-b border-r border-slate-300">Part Number</th>
            {months.map((m) => (
              <th key={m} colSpan={columns.filter((c) => c.monthIdx === m).length} className="sticky top-0 z-30 bg-slate-100 border-b border-l border-slate-300 px-2 text-left whitespace-nowrap">{monthLabels[m]}</th>
            ))}
          </tr>
          <tr>
            {columns.map((c) => (
              <th key={c.key} data-col="num" style={{ top: ROW_H }} className={`sticky z-30 min-w-[3rem] px-1 py-0.5 font-medium text-center border-b border-slate-300 ${c.kind === 'total' ? 'bg-blue-100 text-blue-800' : c.isWeekend ? 'bg-slate-200' : c.exists ? 'bg-slate-100' : 'bg-slate-200 text-slate-400'}`}>
                {c.kind === 'total' ? 'รวม' : c.day}
                {c.kind === 'day' && <span className="block text-[10px] font-normal text-slate-500">{c.weekday === null ? '' : WEEKDAY_LABELS[c.weekday]}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {win.padTop > 0 && <tr style={{ height: win.padTop }}><td colSpan={columns.length + 1} /></tr>}
          {items.slice(win.start, win.end).map((it) => {
            const isGroup = it.type === 'group';
            const bg = isGroup ? 'bg-slate-100 font-semibold' : 'bg-white';
            const chips = findings?.get(`${it.plant}|${it.partNumber}|${it.dock}`);
            return (
              <tr key={it.key} style={{ height: ROW_H }} className={isGroup ? 'font-semibold' : ''}>
                <td className={`sticky left-0 z-20 ${bg} px-2 whitespace-nowrap border-b border-r border-slate-200 max-w-[14rem]`} title={it.partDesc || ''}>
                  <span className={isGroup ? '' : 'font-mono'}>{it.partNumber}</span>
                  {chips && <span className="ml-1 inline-block px-1.5 rounded bg-amber-100 text-amber-800 text-[10px]" title={chips.map((x) => x.message || x.code).join('\n')}>{chips.length} ข้อสังเกต</span>}
                </td>
                {columns.map((c) => {
                  const v = c.exists ? cellValue(it, c) : 0;
                  const over = c.kind === 'day' && c.exists && ((view === 'dock') ? isGroup : !isGroup) && isOver(v, cap);
                  return (
                    <td key={c.key} className={`${num} ${over ? 'bg-red-200 text-red-800 font-semibold' : isGroup ? 'bg-slate-100' : shade(c)} ${c.kind === 'total' ? 'font-semibold' : ''}`} data-over={over ? '1' : undefined}>
                      {v ? formatNumber(v) : ''}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {win.padBottom > 0 && <tr style={{ height: win.padBottom }}><td colSpan={columns.length + 1} /></tr>}
        </tbody>
        <tfoot>
          <tr style={{ height: ROW_H }}>
            <td className="sticky left-0 bottom-0 z-30 bg-blue-50 px-2 font-bold border-t border-r border-slate-300">รวม ({items.filter((i) => i.type === 'row').length} แถว)</td>
            {columns.map((c) => {
              const v = c.kind === 'total' ? foot.totals[c.monthIdx] : foot.days[c.monthIdx][c.day - 1];
              return <td key={c.key} className="sticky bottom-0 z-20 bg-blue-50 px-1.5 text-right tabular-nums font-bold border-t border-slate-300 whitespace-nowrap">{c.exists && v ? formatNumber(v) : ''}</td>;
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DailyGridTab({ state, actions, monthLabels }) {
  const ctx = { state, actions, monthLabels };
  const s = settingsOf(ctx);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const { processedData, productionMonth } = state;
  const columns = useMemo(() => buildColumns(s.preset, productionMonth), [s.preset, productionMonth]);
  const items = useMemo(() => buildGridItems(processedData, { view: s.view, plant: s.plant, search }), [processedData, s.view, s.plant, search]);
  const findings = useMemo(() => findingsOf(state), [state]);
  const monthIdxs = [...new Set(columns.map((c) => c.monthIdx))];
  const kpiMonth = monthIdxs.length === 1 ? monthIdxs[0] : 0;
  const over = overDays(items, s.view, s.capacity, monthIdxs);
  const showPlantPicker = s.view === 'plant' || s.view === 'dock';

  const copy = async () => {
    const text = toTsv(gridToAoa(items, columns, monthLabels));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      actions.setNotice('คัดลอกไม่สำเร็จ เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด ลองกดใหม่อีกครั้งหรืออนุญาตสิทธิ์คลิปบอร์ด');
    }
  };
  const chip = (active) => `px-3 py-1.5 rounded-lg text-sm border ${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`;

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">ตารางรายวัน</h2>
        <button type="button" onClick={() => setPrint(ctx, true)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 text-sm">
          <span className="w-4 h-4"><Icons.File /></span>พิมพ์แผนรายวัน
        </button>
      </div>

      <Kpis processedData={processedData} monthIdx={kpiMonth} label={monthLabels[kpiMonth]} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="คอลัมน์ที่แสดง">
        {PRESETS.map((p) => <button key={p.id} type="button" aria-pressed={s.preset === p.id} onClick={() => updateSettings(ctx, { preset: p.id })} className={chip(s.preset === p.id)}>{p.label}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="มุมมอง">
          {VIEW_MODES.map((v) => <button key={v.id} type="button" aria-pressed={s.view === v.id} onClick={() => updateSettings(ctx, { view: v.id })} className={chip(s.view === v.id)}>{v.label}</button>)}
        </div>
        {showPlantPicker && (
          <select aria-label="โรงงาน" value={s.plant} onChange={(e) => updateSettings(ctx, { plant: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            {s.view === 'dock' && <option value="ALL">ทุกโรงงาน</option>}
            {PLANTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="relative flex-1 min-w-[10rem] max-w-xs">
          <span className="absolute left-2.5 top-2 w-4 h-4 text-slate-400"><Icons.Search /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา Part Number" aria-label="ค้นหา Part Number" className="w-full border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 bg-white" />
        </label>
        <label className="flex items-center gap-2">กำลังรับ/วัน
          <input type="number" min="0" inputMode="numeric" value={s.capacity} onChange={(e) => updateSettings(ctx, { capacity: e.target.value })} className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 bg-white" aria-label="กำลังรับต่อวัน" />
        </label>
        {Number(s.capacity) > 0 && <span className={over ? 'text-red-700' : 'text-emerald-700'}>{over ? `เกินกำลัง ${over} วัน` : 'ไม่มีวันเกินกำลัง'}</span>}
        <button type="button" onClick={copy} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700">
          <span className="w-4 h-4"><Icons.Download /></span>{copied ? 'คัดลอกแล้ว' : 'คัดลอก (TSV)'}
        </button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.includeInExport} onChange={(e) => updateSettings(ctx, { includeInExport: e.target.checked })} />ใส่ชีท “{DAILY_TOTAL_SHEET}” ตอนดาวน์โหลด
        </label>
      </div>
      <p className="text-xs text-slate-500">วันที่ไม่มีตัวเลขหมายถึง “ไม่มีการส่ง” (ซ่อนค่า 0) · วันอาทิตย์แรเงาเทา · วันที่ไม่มีในเดือนแรเงาเข้ม{view_hint(s.view)}</p>

      {items.length === 0
        ? <p className="py-10 text-center text-slate-500">ไม่พบรายการ{search ? ` ที่ตรงกับ “${search}”` : ' ในมุมมองนี้ ลองเลือกโรงงานอื่น'}</p>
        : <Grid items={items} columns={columns} view={s.view} capacity={s.capacity} monthLabels={monthLabels} findings={findings} />}
    </div>
  );
}
const view_hint = (view) => (view === 'dock' ? ' · กำลังรับเทียบกับยอดรวมของแต่ละ Dock' : ' · กำลังรับเทียบกับแต่ละแถว');

export default defineFeature({
  id: ID,
  order: 25,
  group: 'core',
  description: 'ตารางยอดรายวัน ค้นหา คัดลอก และพิมพ์แผนรายวัน',
  tab: {
    label: 'ตารางรายวัน',
    Icon: Icons.Eye,
    enabled: (ctx) => !!ctx.state.processedData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    Component: DailyGridTab,
  },
  headerActions: (ctx) => {
    if (!ctx.state.processedData) return [];
    const on = settingsOf(ctx).includeInExport;
    return [
      { label: 'พิมพ์แผนรายวัน', Icon: Icons.File, onClick: () => setPrint(ctx, true), priority: 1 },
      { label: `ส่งออกชีท ${DAILY_TOTAL_SHEET}: ${on ? 'เปิด' : 'ปิด'}`, Icon: Icons.Sort, onClick: () => updateSettings(ctx, { includeInExport: !on }), priority: 0 },
    ];
  },
  exportSheets: (ctx) => {
    const s = settingsOf(ctx);
    if (!s.includeInExport || !ctx.state.processedData) return [];
    return [{ name: DAILY_TOTAL_SHEET, aoa: buildDailyTotalAoa(ctx.state.processedData, { merged: s.view === 'merged', labels: ctx.monthLabels }) }];
  },
  slots: {
    banner: (ctx) => (ctx.state.features?.[ID]?.printOpen && ctx.state.processedData ? (
      <PrintView
        processedData={ctx.state.processedData}
        monthLabels={ctx.monthLabels}
        productionMonth={ctx.state.productionMonth}
        sourceFiles={ctx.state.sourceFiles}
        onClose={() => setPrint(ctx, false)}
      />
    ) : null),
  },
});
