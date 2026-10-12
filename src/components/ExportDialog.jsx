import { useId } from 'react';
import Modal from './Modal.jsx';
import Icons from './Icons.jsx';
import { Button, Chip } from '../features/ui-kit/index.js';
import { formatNumber } from '../utils/format.js';

// Export dialog ("ตรวจสอบก่อนดาวน์โหลด"). Presentational: the host (features/export-gate/ExportGateHost.jsx)
// owns the state and passes issues, plan, options and callbacks. The result view is `resultSlot`.
const SECTIONS = [
  { level: 'block', title: 'ต้องแก้ก่อน', box: 'border-red-200 bg-red-50', text: 'text-red-800', Icon: Icons.Alert, color: 'text-red-500' },
  { level: 'confirm', title: 'โปรดยืนยัน', box: 'border-amber-200 bg-amber-50', text: 'text-amber-900', Icon: Icons.Info, color: 'text-amber-500' },
  { level: 'info', title: 'ข้อมูล', box: 'border-slate-200 bg-slate-50', text: 'text-slate-700', Icon: Icons.Info, color: 'text-slate-400' },
];

function IssueSection({ section, issues, onAction }) {
  if (!issues.length) return null;
  return (
    <section aria-label={section.title} className={`border rounded-xl p-3 sm:p-4 ${section.box}`}>
      <h3 className={`font-semibold mb-2 ${section.text}`}>{section.title} ({issues.length})</h3>
      <ul className="space-y-3">
        {issues.map((i, idx) => (
          <li key={`${i.code}-${idx}`} className="flex gap-2">
            <span className={`w-5 h-5 flex-shrink-0 mt-0.5 ${section.color}`}><section.Icon /></span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm break-words ${section.text}`}><span className="font-mono text-xs opacity-70 mr-1">{i.code}</span>{i.message}</p>
              {i.fix && <p className="text-xs text-slate-600 mt-0.5 break-words">วิธีแก้: {typeof i.fix === 'string' ? i.fix : i.fix.label || ''}</p>}
              {i.action && onAction && (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => onAction(i.action)}>{i.action.label}</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanTable({ plan }) {
  if (!plan) return null;
  const rows = [...plan.sheets, ...(plan.analyze ? [{ ...plan.analyze, sheet: 'Analyze' }] : [])];
  return (
    <section aria-label="แผนการเขียน">
      <h3 className="font-semibold text-slate-700 mb-2">
        แผนการเขียน <Chip>{plan.mode === 'template' ? 'เขียนลงเทมเพลต' : 'สร้างไฟล์ใหม่ (ค่าล้วน)'}</Chip>
      </h3>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="text-left px-3 py-2">ชีต</th><th className="text-right px-3 py-2">แถว</th><th className="text-right px-3 py-2">เริ่มแถว</th><th className="text-right px-3 py-2">รองรับ</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sheet} className={`border-t border-slate-100 ${r.over ? 'bg-red-50 text-red-700' : ''}`}>
                <td className="px-3 py-1.5 whitespace-nowrap">{r.sheet}</td>
                <td className="px-3 py-1.5 text-right num">{formatNumber(r.rows)}</td>
                <td className="px-3 py-1.5 text-right num">{plan.mode === 'template' ? r.startRow : '-'}</td>
                <td className="px-3 py-1.5 text-right num whitespace-nowrap">
                  {r.sheet === 'Analyze' && r.capacity !== null ? `${formatNumber(r.rows)}/${formatNumber(r.capacity)}` : r.capacity ?? '-'}
                  {r.over ? ' ⚠' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plan.cellWrites?.length > 0 && (
        <p className="text-xs text-slate-500 mt-2 break-words">เซลล์หัวเทมเพลตที่จะเขียน {plan.cellWrites.length} รายการ: {plan.cellWrites.slice(0, 4).map((w) => `${w.sheet}!${w.ref}`).join(', ')}{plan.cellWrites.length > 4 ? ' ...' : ''}</p>
      )}
    </section>
  );
}

function OptionsSection({ options, onOptions, extraSheets, fileNamePreview }) {
  const id = useId();
  const toggle = (name) => {
    const set = new Set(options.excludeSheets);
    if (set.has(name)) set.delete(name); else set.add(name);
    onOptions({ excludeSheets: [...set] });
  };
  return (
    <section aria-label="ตัวเลือกการส่งออก" className="space-y-3">
      <h3 className="font-semibold text-slate-700">ตัวเลือก</h3>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer min-h-[44px]">
        <input type="checkbox" checked={options.highlight} onChange={(e) => onOptions({ highlight: e.target.checked })} className="rounded w-4 h-4" />
        ไฮไลต์แถวที่เขียนใหม่ (สีฟ้าอ่อน)
      </label>
      <div>
        <label htmlFor={`${id}-name`} className="block text-sm text-slate-600 mb-1">ชื่อไฟล์ ({'{month}'} = เดือนผลิต, {'{date}'} = วันที่)</label>
        <input id={`${id}-name`} value={options.fileNamePattern} onChange={(e) => onOptions({ fileNamePattern: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[44px]" data-testid="export-filename" />
        <p className="text-xs text-slate-500 mt-1 break-all">จะบันทึกเป็น: <span className="font-mono">{fileNamePreview}</span></p>
      </div>
      {extraSheets.length > 0 && (
        <fieldset>
          <legend className="text-sm text-slate-600 mb-1">ชีตเสริมที่จะแนบ</legend>
          {extraSheets.map((s) => (
            <label key={s.name} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer min-h-[44px]">
              <input type="checkbox" checked={!options.excludeSheets.includes(s.name)} onChange={() => toggle(s.name)} className="rounded w-4 h-4" />
              <span className="min-w-0 break-words">{s.name} <span className="text-slate-400">({formatNumber(s.rows)} แถว)</span></span>
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}

/**
 * @param {object} p
 * @param {'gate'|'options'|'result'} p.view
 * @param {object[]} p.issues  gate issues (block > confirm > info)
 * @param {object} [p.plan]  planExport() result
 * @param {object} p.options  { highlight, fileNamePattern, excludeSheets }
 * @param {{name:string,rows:number}[]} p.extraSheets
 * @param {boolean} p.override  override checkbox state
 * @param {string} p.title  accessible dialog name
 */
export default function ExportDialog({
  view, title, issues = [], plan, options, onOptions, extraSheets = [], fileNamePreview,
  override, onOverride, busy, onClose, onDownload, onAction, resultSlot,
}) {
  const blocks = issues.filter((i) => i.level === 'block');
  const confirms = issues.filter((i) => i.level === 'confirm');
  const locked = blocks.length > 0 && !override;
  return (
    <Modal onClose={onClose} className="max-w-2xl max-h-[92vh]" label={title} layer="top">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-lg text-slate-900 min-w-0 break-words">{title}</h2>
        <button type="button" onClick={onClose} className="w-11 h-11 rounded-lg text-slate-500 hover:bg-slate-100 flex-shrink-0" aria-label="ปิด">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {view === 'result' ? resultSlot : (
          <>
            {!issues.length && <p className="text-sm text-emerald-700 flex items-center gap-2"><span className="w-5 h-5"><Icons.Check /></span>ไม่พบรายการที่ต้องแก้หรือยืนยัน พร้อมดาวน์โหลด</p>}
            {SECTIONS.map((s) => <IssueSection key={s.level} section={s} issues={issues.filter((i) => i.level === s.level)} onAction={onAction} />)}
            {blocks.length > 0 && (
              <label className="flex items-start gap-2 text-sm text-red-800 cursor-pointer min-h-[44px]">
                <input type="checkbox" checked={override} onChange={(e) => onOverride(e.target.checked)} className="rounded w-4 h-4 mt-1" data-testid="export-override" />
                <span>ฉันเข้าใจความเสี่ยงและต้องการดาวน์โหลดต่อ</span>
              </label>
            )}
            <PlanTable plan={plan} />
            <OptionsSection options={options} onOptions={onOptions} extraSheets={extraSheets} fileNamePreview={fileNamePreview} />
          </>
        )}
      </div>

      <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{view === 'result' ? 'ปิด' : 'ยกเลิก'}</Button>
        {view !== 'result' && (
          <Button onClick={onDownload} disabled={locked} loading={busy} Icon={Icons.Download} data-testid="export-dialog-download"
            title={locked ? 'ติ๊ก “ฉันเข้าใจความเสี่ยง...” ก่อนจึงจะดาวน์โหลดได้' : undefined}>
            {confirms.length || blocks.length ? 'ยืนยันและดาวน์โหลด' : 'ดาวน์โหลด'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
