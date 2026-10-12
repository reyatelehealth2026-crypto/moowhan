import { useMemo, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { Button } from '../ui-kit/index.js';
import { dayValues } from '../../lib/excel/daily.js';
import { MONTH_LABELS, applyDayMove } from './edits.js';
import { ReasonPicker, resolveReason } from './EditBar.jsx';

/** "ย้ายยอดวัน": moves a quantity between two days of one month; the month total (N) stays the same. */
export default function DayMoveDialog({ row, monthLabels, calendar, onSubmit, onClose }) {
  const [monthIdx, setMonthIdx] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [qty, setQty] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState({ chip: '', text: '' });
  const days = useMemo(() => dayValues(row, monthIdx), [row, monthIdx]);
  const res = useMemo(
    () => (from && to && qty ? applyDayMove(row, monthIdx, from, to, qty, { calendar, confirmNonWorking: confirm }) : null),
    [row, monthIdx, from, to, qty, calendar, confirm],
  );
  const resolved = resolveReason(reason.chip, reason.text);
  const ok = res && !res.error;
  const dayInput = (value, set, label, testId) => (
    <label className="text-sm text-slate-600 flex flex-col gap-1">
      {label}
      <input type="number" min="1" max="31" inputMode="numeric" value={value} onChange={(e) => { set(e.target.value); setConfirm(false); }} data-testid={testId} className="px-3 py-2 min-h-[44px] border border-slate-300 rounded-lg text-slate-900" />
    </label>
  );
  return (
    <Modal onClose={onClose} label="ย้ายยอดวัน" className="max-w-lg max-h-[92vh]">
      <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
        <div>
          <h3 className="text-lg font-semibold">ย้ายยอดวัน</h3>
          <p className="text-sm text-slate-500 font-mono">{row.partNumber} · {row.plant} · {String(row.dockCode ?? '')}</p>
        </div>
        <label className="text-sm text-slate-600 flex flex-col gap-1">
          เดือน
          <select value={monthIdx} onChange={(e) => { setMonthIdx(Number(e.target.value)); setConfirm(false); }} className="px-3 py-2 min-h-[44px] border border-slate-300 rounded-lg text-slate-900">
            {MONTH_LABELS.map((l, i) => <option key={l} value={i}>{monthLabels?.[i] || l}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {dayInput(from, setFrom, 'จากวันที่', 'move-from')}
          {dayInput(to, setTo, 'ไปวันที่', 'move-to')}
          <label className="text-sm text-slate-600 flex flex-col gap-1">
            จำนวน (ชิ้น)
            <input type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="move-qty" className="px-3 py-2 min-h-[44px] border border-slate-300 rounded-lg text-slate-900" />
          </label>
        </div>
        <p className="text-xs text-slate-500 num">
          {Number(from) >= 1 && Number(from) <= 31 && `วันที่ ${from} มี ${days[Number(from) - 1]} ชิ้น`}
          {Number(from) >= 1 && Number(to) >= 1 && Number(to) <= 31 && ` · วันที่ ${to} มี ${days[Number(to) - 1]} ชิ้น`}
        </p>
        {res?.error && <p className="text-sm text-red-600" role="alert" data-testid="move-error">{res.error}</p>}
        {res?.needsConfirm && (
          <label className="flex items-center gap-2 text-sm min-h-[44px]">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="w-5 h-5" />
            ยืนยันย้ายไปวันที่ไม่ใช่วันทำงาน
          </label>
        )}
        {ok && <p className="text-sm font-medium num" data-testid="move-preview">{res.changes[0]} · ยอด {MONTH_LABELS[monthIdx]} ไม่เปลี่ยน</p>}
        <ReasonPicker value={reason} onChange={setReason} idPrefix="move-reason" />
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button disabled={!ok || !resolved} data-testid="move-save" onClick={() => onSubmit({ kind: 'dayMove', monthIdx, fromDay: Number(from), toDay: Number(to), qty: Number(qty), confirmNonWorking: confirm, reason: resolved })}>ย้ายยอด</Button>
        </div>
      </div>
    </Modal>
  );
}
