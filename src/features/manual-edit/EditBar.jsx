import { useMemo, useState } from 'react';
import { Button } from '../ui-kit/index.js';
import { DEFAULT_STRATEGY, REASON_MAX, STRATEGIES, applyRowEdit } from './edits.js';

export const REASON_CHIPS = ['TMT แจ้งแก้', 'ปรับตามสต็อก', 'ปรับตามกำลังผลิต', 'อื่นๆ'];

/** chip + free text -> the reason string to store ('' while incomplete). 'อื่นๆ' needs text. */
export const resolveReason = (chip, text) => {
  if (!chip) return '';
  if (chip !== 'อื่นๆ') return chip;
  return String(text || '').trim().slice(0, REASON_MAX);
};

/** Reason chips + the free-text field of 'อื่นๆ'. Controlled: value = { chip, text }. */
export function ReasonPicker({ value, onChange, idPrefix = 'reason' }) {
  const { chip, text } = value;
  return (
    <div>
      <div role="group" aria-label="เหตุผล" className="flex flex-wrap gap-2">
        {REASON_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={chip === c}
            onClick={() => onChange({ chip: c, text })}
            data-testid={`${idPrefix}-chip-${c}`}
            className={`px-3 py-2 min-h-[44px] rounded-full text-sm border ${chip === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
          >
            {c}
          </button>
        ))}
      </div>
      {chip === 'อื่นๆ' && (
        <input
          type="text"
          value={text}
          maxLength={REASON_MAX}
          onChange={(e) => onChange({ chip, text: e.target.value })}
          placeholder={`ระบุเหตุผล (ไม่เกิน ${REASON_MAX} ตัวอักษร)`}
          aria-label="ระบุเหตุผล"
          data-testid={`${idPrefix}-text`}
          className="mt-2 w-full px-3 py-2 min-h-[44px] border border-slate-300 rounded-lg text-sm"
        />
      )}
      {!resolveReason(chip, text) && <p className="text-xs text-slate-500 mt-2" role="status">กรุณาเลือกเหตุผล{chip === 'อื่นๆ' ? ' (พิมพ์ข้อความ)' : ''}</p>}
    </div>
  );
}

export const StrategySelect = ({ value, onChange, id }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 min-h-[44px] border border-slate-300 rounded-lg text-sm bg-white" data-testid="edit-strategy">
    {Object.entries(STRATEGIES).map(([k, label]) => <option key={k} value={k}>{label}{k === DEFAULT_STRATEGY ? ' (ค่าเริ่มต้น)' : ''}</option>)}
  </select>
);

/**
 * Inline bar under a row with pending edits.
 *  row        the saved row, patch = { n?, n1?, ... } pending values
 *  onSave({ strategy, reason })   onCancel()
 */
export default function EditBar({ row, patch, calendar, onSave, onCancel }) {
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [reason, setReason] = useState({ chip: '', text: '' });
  const preview = useMemo(() => applyRowEdit(row, patch, { strategy, calendar }), [row, patch, strategy, calendar]);
  const resolved = resolveReason(reason.chip, reason.text);

  return (
    <div className="space-y-3" data-testid="edit-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-slate-700">ตัวอย่างผลลัพธ์:</span>
        {preview.error ? <span className="text-red-600" role="alert">{preview.error}</span>
          : preview.unchanged ? <span className="text-slate-500">ยังไม่มีค่าที่เปลี่ยน</span>
            : preview.changes.map((c) => <span key={c} className="num font-medium text-slate-900" data-testid="edit-preview">{c}</span>)}
      </div>
      {preview.dayChanges?.length > 0 && (
        <p className="text-xs text-slate-500">
          ปรับยอดรายวัน: {preview.dayChanges.slice(0, 4).map((d) => `${d.month} วันที่ ${d.day} (${d.before}→${d.after})`).join(', ')}
          {preview.dayChanges.length > 4 ? ` และอีก ${preview.dayChanges.length - 4} วัน` : ''}
        </p>
      )}
      {strategy === 'none' && <p className="text-xs text-amber-700">ผลรวมรายวันจะไม่เท่ากับยอดรวม ระบบตรวจคุณภาพ (R01) จะแจ้งเตือนเมื่อมีใช้งาน</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="edit-strategy" className="text-sm text-slate-600">วิธีปรับยอดรายวัน</label>
        <StrategySelect id="edit-strategy" value={strategy} onChange={setStrategy} />
      </div>
      <ReasonPicker value={reason} onChange={setReason} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!resolved || !!preview.error || !!preview.unchanged} onClick={() => onSave({ strategy, reason: resolved })} data-testid="edit-save">บันทึก</Button>
        <Button variant="secondary" onClick={onCancel} data-testid="edit-cancel">ยกเลิก</Button>
      </div>
    </div>
  );
}
