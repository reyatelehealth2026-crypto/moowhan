import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../utils/download.js';
import { PLANTS, MONTH_KEYS } from '../../constants.js';
import { formatNumber } from '../../utils/format.js';
import { Chip, DataGrid, KpiCard, pushToast } from '../ui-kit/index.js';
import { allRows, groupRows, multiDockParts, deliveryDays, basePartNumber, shippingDockText } from './logic.js';
import { buildBoxRows, palletKey, readPackingTypeMap, sumNullable } from './packaging.js';
import { dockLabel, emptyMaster, exportMasterJson, loadMaster, parseMasterJson, saveMaster, setDock, setPallet } from './master.js';

export const ID = 'dock-analysis';
export const GROUP_OPTIONS = [
  { id: 'plant', label: 'โรงงาน' },
  { id: 'dock', label: 'Dock' },
  { id: 'carFamily', label: 'Car Family' },
  { id: 'basePart', label: 'Part หลัก' },
  { id: 'packing', label: 'บรรจุภัณฑ์' },
];
export const DEFAULTS = { by: 'dock', plant: 'all', unit: 'pieces', partType: '', showAllFiles: false, exportOpts: { dock: false, carFamily: false, boxes: false } };
const PART_TYPE_LABEL = { V: 'Vehicle', P: 'Packing' };

const btn = (active) => `px-3 py-1.5 rounded-lg text-sm border whitespace-nowrap ${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`;
const input = 'px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white min-w-0';

function Seg({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={btn(value === o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export default function DockPanel({ state, actions, monthLabels }) {
  const data = { ...DEFAULTS, ...(state.features?.[ID] || {}) };
  const set = (patch) => actions.setFeatureData(ID, patch);
  const { processedData, template } = state;
  const master = data.master || emptyMaster();
  const packMap = data.packMap || null;
  const [importError, setImportError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { if (!state.features?.[ID]?.master) set({ master: loadMaster() }); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    let live = true;
    if (template?.buffer && template.kind === 'xlsx') readPackingTypeMap(template.buffer).then((m) => { if (live) set({ packMap: m }); });
    else set({ packMap: new Map() });
    return () => { live = false; };
    // eslint-disable-next-line
  }, [template]);

  const updateMaster = (next) => { saveMaster(next); set({ master: next }); };

  const everyRow = useMemo(() => allRows(processedData), [processedData]);
  const partTypes = useMemo(() => [...new Set(everyRow.map((r) => String(r.partType || '').trim()).filter(Boolean))].sort(), [everyRow]);
  const plants = data.plant === 'all' ? undefined : [data.plant];
  const isPacking = data.by === 'packing';
  // packing view defaults to PART TYPE P files when the files carry a type
  const typeFilter = isPacking && !data.showAllFiles && partTypes.includes('P') && !data.partType ? 'P' : data.partType || undefined;
  const opts = { plants, partType: typeFilter };

  const groups = useMemo(() => (isPacking ? [] : groupRows(processedData, { by: data.by, ...opts })), [processedData, data.by, data.plant, typeFilter]); // eslint-disable-line
  const multi = useMemo(() => multiDockParts(processedData, { plants }), [processedData, data.plant]); // eslint-disable-line
  const dockTotal = useMemo(() => groupRows(processedData, { by: 'dock', plants }).length, [processedData, data.plant]); // eslint-disable-line
  const boxRows = useMemo(() => (isPacking ? buildBoxRows(allRows(processedData, opts), master, packMap) : []), [processedData, isPacking, master, packMap, data.plant, typeFilter]); // eslint-disable-line
  const [showMulti, setShowMulti] = useState(false);

  const unitBoxes = data.unit === 'boxes';
  const valueOf = (g, k) => (unitBoxes ? g.boxes[k] : g[k]);
  const fmt = (v) => (v === null || v === undefined ? '-' : formatNumber(v));
  const label = (g) => (g.by === 'dock' ? dockLabel(master, g.plant, g.dockCode) : g.label);
  const labelFull = (g) => (g.by === 'dock' ? `${g.plant} · ${label(g)}` : g.label);

  const groupCols = [
    { key: 'label', label: GROUP_OPTIONS.find((o) => o.id === data.by)?.label || 'กลุ่ม', value: labelFull },
    { key: 'parts', label: 'จำนวน Part', num: true },
    ...MONTH_KEYS.map((k, i) => ({ key: k, label: `${monthLabels?.[i] || k.toUpperCase()}${unitBoxes ? ' (กล่อง)' : ''}`, num: true, value: (g) => valueOf(g, k) })),
    { key: 'days', label: 'วันส่ง (N)', num: true, value: (g) => deliveryDays(g.rows, 0).days },
    { key: 'peak', label: 'พีค/วัน', num: true, value: (g) => deliveryDays(g.rows, 0).peak, render: (g) => { const d = deliveryDays(g.rows, 0); return d.peakDay ? `${formatNumber(d.peak)} (วันที่ ${d.peakDay})` : '-'; } },
  ];
  if (data.by === 'dock') groupCols.splice(1, 0, { key: 'ship', label: 'Shipping Dock', value: shippingDockText });

  const expanded = (g) => (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead><tr className="text-left text-slate-500"><th className="px-2 py-1">Part Number</th><th className="px-2 py-1">โรงงาน/Dock</th><th className="px-2 py-1 text-right">Packing</th>{MONTH_KEYS.map((k) => <th key={k} className="px-2 py-1 text-right">{k.toUpperCase()}</th>)}</tr></thead>
        <tbody>
          {g.rows.map((r) => (
            <tr key={r.id || `${r.partNumber}${r.dockCode}`} className="border-t border-slate-100">
              <td className="px-2 py-1 font-mono whitespace-nowrap">{r.partNumber}</td>
              <td className="px-2 py-1 whitespace-nowrap">{r.plant} · {String(r.dockCode || '').trim() || '-'}</td>
              <td className="px-2 py-1 text-right num">{fmt(Number(r.packingSize) || null)}</td>
              {MONTH_KEYS.map((k) => <td key={k} className="px-2 py-1 text-right num">{formatNumber(r[k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const [onlyUneven, setOnlyUneven] = useState(false);
  const shownBox = onlyUneven ? boxRows.filter((b) => !b.exact) : boxRows;
  const boxCols = [
    { key: 'part', label: 'Part Number', value: (b) => b.row.partNumber, render: (b) => <span className="font-mono">{b.row.partNumber}</span> },
    { key: 'plant', label: 'โรงงาน', value: (b) => b.row.plant },
    { key: 'dock', label: 'Dock', value: (b) => dockLabel(master, b.row.plant, b.dock) },
    { key: 'size', label: 'Packing Size', num: true, value: (b) => b.size ?? -1, render: (b) => (b.size === null ? '-' : formatNumber(b.size)) },
    { key: 'type', label: 'Packing Type', value: (b) => b.packingType, render: (b) => (b.packingType ? <span>{b.packingType}{b.inferred && <Chip tone="neutral" className="ml-1">อนุมาน</Chip>}</span> : '-') },
    { key: 'pieces', label: 'ชิ้น (N)', num: true, value: (b) => b.row.n },
    { key: 'boxes', label: 'กล่อง (N)', num: true, value: (b) => b.boxes.n ?? -1, render: (b) => fmt(b.boxes.n) },
    { key: 'bpp', label: 'กล่อง/พาเลท', value: (b) => b.boxesPerPallet ?? 0, render: (b) => (
      <input aria-label={`กล่องต่อพาเลท ${b.row.partNumber}`} type="number" min="1" max="10000" inputMode="numeric" className={`${input} w-20`} defaultValue={b.boxesPerPallet ?? ''}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => { const v = e.target.value; const key = palletKey(b.row.plant, b.basePart, b.dock); if (v !== '' && !(Number(v) >= 1 && Number(v) <= 10000)) { pushToast({ message: 'กล่องต่อพาเลทต้องเป็นตัวเลข 1 ถึง 10000', tone: 'error' }); e.target.value = b.boxesPerPallet ?? ''; return; } updateMaster(setPallet(master, key, v)); }} />
    ) },
    { key: 'pallets', label: 'พาเลท (N)', num: true, value: (b) => b.pallets.n ?? -1, render: (b) => fmt(b.pallets.n) },
    { key: 'exact', label: 'หมายเหตุ', value: (b) => (b.exact ? 0 : 1), render: (b) => (b.exact ? '' : <Chip tone="info">ไม่ลงตัว</Chip>) },
  ];

  const importFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 200 * 1024) { setImportError('ไฟล์ตั้งค่าใหญ่เกิน 200KB จึงไม่นำเข้า'); return; }
    const r = parseMasterJson(await f.text());
    if (!r.ok) { setImportError(r.error); return; }
    setImportError('');
    updateMaster(r.master);
    pushToast({ message: 'นำเข้าการตั้งค่า Dock แล้ว', tone: 'success' });
  };
  const exportFile = () => {
    downloadText(exportMasterJson(master), 'dock-settings.json', 'application/json');
  };

  const dockKeys = useMemo(() => groupRows(processedData, { by: 'dock' }).map((g) => ({ key: `${g.plant}|${g.dockCode}`, plant: g.plant, dock: g.dockCode })), [processedData]);

  const multiShown = multi;
  return (
    <div className="space-y-4 min-w-0">
      <h2 className="text-xl font-bold">วิเคราะห์ Dock/รุ่น/บรรจุภัณฑ์</h2>
      <div className="space-y-2">
        <Seg label="จัดกลุ่มตาม" options={GROUP_OPTIONS} value={data.by} onChange={(by) => set({ by })} />
        <div className="flex flex-wrap items-center gap-2">
          <Seg label="โรงงาน" options={[{ id: 'all', label: 'ทุกโรงงาน' }, ...PLANTS.map((p) => ({ id: p, label: p }))]} value={data.plant} onChange={(plant) => set({ plant })} />
          {partTypes.length > 0 && (
            <label className="text-sm text-slate-600 flex items-center gap-1">ประเภทไฟล์
              <select className={input} value={data.partType} onChange={(e) => set({ partType: e.target.value, showAllFiles: !!e.target.value || data.showAllFiles })}>
                <option value="">ทั้งหมด</option>
                {partTypes.map((t) => <option key={t} value={t}>{PART_TYPE_LABEL[t] || t}</option>)}
              </select>
            </label>
          )}
          {!isPacking && <Seg label="หน่วย" options={[{ id: 'pieces', label: 'ชิ้น' }, { id: 'boxes', label: 'กล่อง' }]} value={data.unit} onChange={(unit) => set({ unit })} />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard label="Dock ทั้งหมด" value={`${dockTotal} แห่ง`} />
        <div>
          <KpiCard label="Part ที่ส่งหลาย Dock" value={`${multi.length} รายการ`} />
          {multi.length > 0 && (
            <button type="button" className="mt-1 text-sm text-blue-700 underline" aria-expanded={showMulti} onClick={() => setShowMulti(!showMulti)}>{showMulti ? 'ซ่อนรายการ' : 'ดูรายการ'}</button>
          )}
        </div>
      </div>
      {showMulti && (
        <ul className="bg-white border border-slate-200 rounded-xl p-3 text-sm space-y-1">
          {multiShown.map((m) => <li key={`${m.plant}${m.partNumber}`}><span className="font-mono">{m.partNumber}</span> <span className="text-slate-500">({m.plant})</span> → {m.dockCodes.join(', ')}</li>)}
        </ul>
      )}

      {isPacking ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0">
          <div className="px-4 py-2 flex flex-wrap items-center gap-3 text-sm border-b">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!data.showAllFiles} onChange={(e) => set({ showAllFiles: e.target.checked })} /> แสดงทุกไฟล์</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyUneven} onChange={(e) => setOnlyUneven(e.target.checked)} /> เฉพาะที่ไม่ลงตัว</label>
            <span className="text-slate-500">ไม่ลงตัว = จำนวนไม่หารด้วย Packing Size ลงตัว (ข้อมูลประกอบ ไม่ใช่ข้อผิดพลาด)</span>
          </div>
          <DataGrid testId="dock-box-grid" columns={boxCols} rows={shownBox} getKey={(b) => b.row.id || `${b.row.plant}${b.row.partNumber}${b.dock}`} resetKey={`${data.plant}|${typeFilter}|${onlyUneven}`}
            searchFields={['partNumber', 'plant', 'dock', 'packingType']} emptyMessage="ไม่มีข้อมูลบรรจุภัณฑ์ตามตัวกรองนี้ ลองเลือก แสดงทุกไฟล์"
            footerLabel={(rows) => `รวม ${rows.length} แถว`}
            footer={(rows) => ({ pieces: formatNumber(rows.reduce((s, b) => s + b.row.n, 0)), boxes: fmt(sumNullable(rows.map((b) => b.boxes), 'n')), pallets: fmt(sumNullable(rows.map((b) => b.pallets), 'n')) })} />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0">
          <DataGrid testId="dock-grid" columns={groupCols} rows={groups} getKey={(g) => g.key} resetKey={`${data.by}|${data.plant}|${typeFilter}`}
            searchFields={['key', 'label', 'carFamily']} renderExpanded={expanded} emptyMessage="ไม่มีข้อมูลตามตัวกรองนี้"
            footerLabel={(rows) => `รวม ${rows.length} กลุ่ม`}
            footer={(rows) => Object.fromEntries(MONTH_KEYS.map((k) => [k, formatNumber(rows.reduce((s, g) => s + valueOf(g, k), 0))]))} />
        </div>
      )}

      <details className="bg-white border border-slate-200 rounded-xl p-3 text-sm">
        <summary className="cursor-pointer font-medium">ตั้งค่า Dock และการส่งออก</summary>
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-slate-500">ชื่อเรียกและ Packing Type ของแต่ละ Dock (เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น)</p>
            {dockKeys.map((d) => (
              <div key={d.key} className="flex flex-wrap items-center gap-2">
                <span className="w-24 font-medium">{d.plant} · {d.dock || '-'}</span>
                <input aria-label={`ชื่อเรียก ${d.key}`} maxLength={40} placeholder="ชื่อเรียก" className={`${input} w-32`} defaultValue={master.docks[d.key]?.alias || ''} onBlur={(e) => updateMaster(setDock(master, d.key, { alias: e.target.value.trim() }))} />
                <input aria-label={`Packing Type ${d.key}`} maxLength={40} placeholder="Packing Type" className={`${input} w-28`} defaultValue={master.docks[d.key]?.packingType || ''} onBlur={(e) => updateMaster(setDock(master, d.key, { packingType: e.target.value.trim() }))} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn(false)} onClick={exportFile}>ส่งออกการตั้งค่า (JSON)</button>
              <button type="button" className={btn(false)} onClick={() => fileRef.current?.click()}>นำเข้าการตั้งค่า (JSON)</button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importFile} aria-label="นำเข้าไฟล์ตั้งค่า" />
            </div>
            {importError && <p role="alert" className="text-red-700">{importError}</p>}
          </div>
          <fieldset className="space-y-1">
            <legend className="text-slate-500">เพิ่มชีทในไฟล์ Excel ที่ดาวน์โหลด (ปิดไว้เป็นค่าเริ่มต้น)</legend>
            {[['dock', 'By Dock'], ['carFamily', 'By Car Family'], ['boxes', 'Boxes']].map(([k, name]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!data.exportOpts?.[k]} onChange={(e) => set({ exportOpts: { ...data.exportOpts, [k]: e.target.checked } })} /> {name}</label>
            ))}
          </fieldset>
        </div>
      </details>
    </div>
  );
}
