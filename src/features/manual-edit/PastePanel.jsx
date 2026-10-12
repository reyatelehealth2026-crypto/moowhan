import { useMemo, useState } from 'react';
import Banner from '../../components/Banner.jsx';
import Icons from '../../components/Icons.jsx';
import { Button } from '../ui-kit/index.js';
import { downloadText } from '../../utils/download.js';
import { MONTH_KEYS } from '../../constants.js';
import { DEFAULT_STRATEGY } from './edits.js';
import { ReasonPicker, StrategySelect, resolveReason } from './EditBar.jsx';
import { MAX_LINES, exportEditsCsv, matchAdjustments, matchesToItems, parseAdjustments } from './paste.js';

const BADGE = {
  'ตรงกัน': 'bg-emerald-100 text-emerald-700',
  'ต้องระบุ Dock': 'bg-amber-100 text-amber-800',
  'ไม่พบ': 'bg-red-100 text-red-700',
  'ไม่เปลี่ยน': 'bg-slate-100 text-slate-600',
};
const LABELS = ['N', 'N+1', 'N+2', 'N+3'];

/** Collapsible "วางรายการ" panel: paste rows from Excel/CSV, preview the match, apply as one batch. */
export default function PastePanel({ processedData, ledger, onApply }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [reason, setReason] = useState({ chip: '', text: '' });

  const matches = useMemo(() => (parsed ? matchAdjustments(parsed.items, processedData) : []), [parsed, processedData]);
  const ready = matches.filter((m) => m.status === 'ตรงกัน');
  const fallback = resolveReason(reason.chip, reason.text);
  const needsReason = ready.some((m) => !m.item.reason);
  const canApply = ready.length > 0 && (!needsReason || !!fallback);

  const apply = () => {
    onApply(matchesToItems(matches, { strategy, reason: fallback }), `นำเข้าแล้ว ${ready.length} รายการ`);
    setParsed(null);
    setText('');
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="paste-toggle" className="w-full flex items-center gap-3 px-4 sm:px-6 py-3 min-h-[48px] text-left font-semibold">
        <span className="w-5 h-5 text-slate-500">{open ? <Icons.ChevronUp /> : <Icons.ChevronDown />}</span>
        วางรายการแก้ไขจาก Excel / CSV
      </button>
      {open && (
        <div className="px-4 sm:px-6 pb-5 space-y-4 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            คอลัมน์: <span className="font-mono">Plant, Part Number, Dock, N, N+1, N+2, N+3, เหตุผล</span> (คั่นด้วย , หรือ Tab; มีหรือไม่มีหัวตารางก็ได้; สูงสุด {MAX_LINES} บรรทัด) — เว้นว่างช่องที่ไม่ต้องการแก้
          </p>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setParsed(null); }}
            rows={6}
            spellCheck={false}
            aria-label="รายการที่ต้องการแก้ไข"
            data-testid="paste-text"
            placeholder={'Plant\tPart Number\tDock\tN\tเหตุผล\nBPK\t86790-0K051-00\tBN\t600\tTMT แจ้งแก้'}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!text.trim()} onClick={() => setParsed(parseAdjustments(text))} data-testid="paste-check">ตรวจสอบรายการ</Button>
            <Button variant="ghost" Icon={Icons.Download} disabled={!ledger.some((e) => e.kind === 'total')} onClick={() => downloadText(exportEditsCsv(ledger), 'manual-edits.csv', 'text/csv;charset=utf-8')}>ส่งออกเป็น CSV</Button>
          </div>

          {parsed && (
            <div className="space-y-3">
              <Banner tone="error" message={parsed.errors.length ? parsed.errors.slice(0, 8).map((e) => e.message).join('\n') + (parsed.errors.length > 8 ? `\nและอีก ${parsed.errors.length - 8} รายการ` : '') : null} />
              {parsed.truncated && <Banner tone="warning" message={`รายการเกิน ${MAX_LINES} บรรทัด ระบบอ่านเฉพาะ ${MAX_LINES} บรรทัดแรก`} />}
              {matches.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left"><tr><th className="px-3 py-2">บรรทัด</th><th className="px-3 py-2">Plant</th><th className="px-3 py-2">Part Number</th><th className="px-3 py-2">Dock</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">ก่อน → หลัง</th></tr></thead>
                    <tbody>
                      {matches.map((m) => (
                        <tr key={m.item.line} className="border-t border-slate-100" data-testid="paste-row">
                          <td className="px-3 py-2 num">{m.item.line}</td>
                          <td className="px-3 py-2">{m.item.plant || '-'}</td>
                          <td className="px-3 py-2 font-mono">{m.item.partNumber}</td>
                          <td className="px-3 py-2">{m.item.dock || '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[m.status]}`}>{m.status}</span>
                            {m.candidates.length > 0 && <span className="ml-2 text-xs text-slate-500">เลือก: {m.candidates.join(', ')}</span>}
                          </td>
                          <td className="px-3 py-2 num whitespace-nowrap">
                            {m.row ? MONTH_KEYS.filter((k) => m.after[k] !== undefined).map((k) => `${LABELS[MONTH_KEYS.indexOf(k)]}: ${m.before[k]} → ${m.after[k]}`).join(' · ') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ready.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-600">วิธีปรับยอดรายวัน</span>
                    <StrategySelect value={strategy} onChange={setStrategy} />
                  </div>
                  {needsReason && (
                    <div>
                      <p className="text-sm text-slate-600 mb-2">เหตุผล (ใช้กับรายการที่ไม่ได้ระบุเหตุผลมาในข้อมูล)</p>
                      <ReasonPicker value={reason} onChange={setReason} idPrefix="paste-reason" />
                    </div>
                  )}
                  <Button disabled={!canApply} onClick={apply} data-testid="paste-apply">นำเข้า {ready.length} รายการ</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
