import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../utils/format.js';
import { INT_ERROR } from './edits.js';

const coarsePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Strict integer >= 0 (thousand separators allowed) -> number, or null. */
export const parseCellInput = (text) => {
  const s = String(text ?? '').trim().replace(/,/g, '');
  return /^\d+$/.test(s) ? Number(s) : null;
};

/**
 * One editable N..N+3 cell.
 *  value      saved value (shown struck-through hint when a draft exists)
 *  pending    value waiting for "บันทึก" in the edit bar (or undefined)
 *  edited     the row cell differs from the source file (amber)
 *  editing    input mode; onCommit(number) / onCancel() / onTab(dir) are called by the input
 * Enter / F2 / double-click (single tap on touch screens) starts editing; Tab commits and moves on; Esc cancels.
 */
export default function EditableCell({ value, pending, packingSize, label, edited, editing, onStart, onCommit, onCancel, onTab, testId }) {
  const shown = pending ?? value;
  const [text, setText] = useState(String(shown));
  const [error, setError] = useState('');
  const input = useRef(null);
  const btn = useRef(null);
  const wasEditing = useRef(false);
  const done = useRef(false); // Enter/Esc/Tab already resolved this edit: the blur caused by unmounting must not repeat it

  useEffect(() => {
    if (editing) {
      done.current = false;
      setText(String(shown));
      setError('');
      requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    } else if (wasEditing.current) btn.current?.focus();
    wasEditing.current = editing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = (dir) => {
    const v = parseCellInput(text);
    if (v === null) { setError(INT_ERROR); input.current?.focus(); return; }
    done.current = true;
    onCommit(v, dir);
  };
  const pack = Number(packingSize) || 0;
  const typed = parseCellInput(text);
  const hint = editing && pack > 1 && typed !== null && typed % pack !== 0 ? `ไม่ใช่ผลคูณของ ${pack} (บรรจุ/กล่อง)` : '';

  if (editing) {
    return (
      <div className="min-w-[88px]">
        <input
          ref={input}
          type="text"
          inputMode="numeric"
          value={text}
          aria-label={`แก้ไข ${label}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${testId}-err` : undefined}
          data-testid={`${testId}-input`}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(0); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done.current = true; onCancel(); }
            else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1); }
          }}
          onBlur={() => { if (done.current) return; if (!error && parseCellInput(text) !== null && parseCellInput(text) !== shown) onCommit(parseCellInput(text), 0); else if (!error) onCancel(); }}
          className={`w-full text-right num px-2 py-1.5 min-h-[36px] border rounded-md bg-white ${error ? 'border-red-400' : 'border-blue-400'}`}
        />
        {error && <p id={`${testId}-err`} role="alert" className="text-xs text-red-600 text-left mt-1 whitespace-normal">{error}</p>}
        {!error && hint && <p className="text-xs text-amber-700 text-left mt-1 whitespace-normal">{hint}</p>}
      </div>
    );
  }
  const tone = pending !== undefined ? 'bg-amber-50 border border-dashed border-amber-400' : edited ? 'bg-amber-100 border border-amber-300' : 'border border-transparent hover:border-slate-300';
  return (
    <button
      ref={btn}
      type="button"
      data-testid={testId}
      title="ดับเบิลคลิก (หรือกด Enter / F2) เพื่อแก้ไข"
      aria-label={`${label}: ${formatNumber(shown)} — กด Enter เพื่อแก้ไข`}
      onDoubleClick={onStart}
      onClick={coarsePointer() ? onStart : undefined}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); onStart(); } }}
      className={`w-full min-w-[72px] min-h-[36px] px-2 py-1 rounded-md text-right num ${tone}`}
    >
      {formatNumber(shown)}
    </button>
  );
}
