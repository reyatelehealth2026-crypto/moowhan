import { useEffect, useRef, useState } from 'react';
import Icons from './Icons.jsx';

const SEVERITY = { error: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-700', info: 'bg-slate-100 text-slate-600' };

/**
 * Dropdown menu button. items: [{ key, label, Icon, onClick, disabled, active, badge: {count,severity}|null }]
 * Keyboard: Enter/Space/ArrowDown opens, ArrowUp/Down/Home/End move, Escape closes.
 */
export default function OverflowMenu({ label = 'เพิ่มเติม', items, badgeCount = 0, Icon, className = '' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open) wrap.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  if (!items.length) return null;

  const move = (dir) => {
    const els = [...wrap.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    if (!els.length) return;
    const i = els.indexOf(document.activeElement);
    const next = dir === 'first' ? 0 : dir === 'last' ? els.length - 1 : (i + dir + els.length) % els.length;
    els[next].focus();
  };
  const onMenuKey = (e) => {
    const map = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (e.key in map) { e.preventDefault(); move(map[e.key]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm sm:text-base whitespace-nowrap"
      >
        {Icon && <span className="w-5 h-5"><Icon /></span>}
        {label}
        {badgeCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{badgeCount}</span>}
        <span className="w-4 h-4"><Icons.ChevronDown /></span>
      </button>
      {open && (
        <div role="menu" aria-label={label} onKeyDown={onMenuKey} className="absolute right-0 top-full mt-1 z-50 min-w-48 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              title={it.disabled ? it.tooltip : undefined}
              onClick={() => { setOpen(false); it.onClick?.(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${it.disabled ? 'text-slate-300 cursor-not-allowed' : it.active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {it.Icon && <span className="w-4 h-4 flex-shrink-0"><it.Icon /></span>}
              <span className="flex-1 min-w-0 truncate">{it.label}</span>
              {it.badge && <span className={`px-1.5 py-0.5 rounded-full text-xs ${SEVERITY[it.badge.severity] || SEVERITY.info}`}>{it.badge.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
