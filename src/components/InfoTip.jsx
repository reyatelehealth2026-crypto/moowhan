import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icons from './Icons.jsx';

/**
 * 14px muted (i) button. Tap / hover / focus opens a tip rendered in a portal on <body> (fixed position),
 * so it is never clipped by scrolling tables. Closes on outside click, Escape and scroll.
 * `content`: string | node | () => node.
 */
export default function InfoTip({ content, label = 'คำอธิบาย', className = '', onOpen }) {
  const id = useId();
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => { if (open) onOpen?.(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(256, window.innerWidth - 16);
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)), width: w });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!btn.current?.contains(e.target) && !e.target.closest?.(`[data-tip="${CSS.escape(id)}"]`)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, close, id]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={close}
        className={`inline-block w-3.5 h-3.5 align-middle text-slate-400 hover:text-slate-600 focus-visible:text-blue-600 flex-shrink-0 ${className}`}
      ><Icons.Info /></button>
      {open && createPortal(
        <span id={id} data-tip={id} role="tooltip" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }} className="z-[70] bg-slate-800 text-white text-xs leading-relaxed rounded-lg px-3 py-2 shadow-lg whitespace-normal font-normal text-left normal-case">
          {typeof content === 'function' ? content() : content}
        </span>,
        document.body,
      )}
    </>
  );
}
