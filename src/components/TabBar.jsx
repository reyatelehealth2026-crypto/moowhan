import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import OverflowMenu from './OverflowMenu.jsx';

export const MAX_VISIBLE_TABS = 7;
const SEVERITY = { error: 'bg-red-500 text-white', warning: 'bg-amber-400 text-white', info: 'bg-white/30' };

/** Split tabs into the visible ones (max 7, active tab always included) and the overflow rest. Pure. */
export const splitTabs = (tabs, activeId, max = MAX_VISIBLE_TABS) => {
  if (tabs.length <= max) return { visible: tabs, overflow: [] };
  let visible = tabs.slice(0, max);
  if (!visible.some((t) => t.id === activeId)) {
    const active = tabs.find((t) => t.id === activeId);
    if (active) visible = [...visible.slice(0, max - 1), active];
  }
  const ids = new Set(visible.map((t) => t.id));
  return { visible, overflow: tabs.filter((t) => !ids.has(t.id)) };
};

/**
 * tabs: [{ id, label, Icon, group, enabled, tooltip, badge: {count,severity}|null }] already sorted.
 * Groups render as labelled segments (the "core" group has no label). The strip scrolls on its own
 * on narrow screens so the page never overflows horizontally.
 */
export default function TabBar({ tabs, activeId, onSelect }) {
  const { visible, overflow } = splitTabs(tabs, activeId);
  const strip = useRef(null);
  const [hint, setHint] = useState(null); // { id, text, left, top } — shown ~2s when a grey tab is tapped
  useEffect(() => {
    if (!hint) return undefined;
    const t = setTimeout(() => setHint(null), 2000);
    return () => clearTimeout(t);
  }, [hint]);
  const showHint = (e, item) => {
    if (item.enabled || !item.tooltip) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHint({ id: item.id, text: item.tooltip, left: Math.max(8, Math.min(r.left, window.innerWidth - 168)), top: r.bottom + 6 });
  };

  useEffect(() => {
    const el = strip.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [activeId]);

  // roving focus: arrows/Home/End move between enabled tabs and activate them
  const onKeyDown = (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    const els = [...e.currentTarget.querySelectorAll('[role="tab"]:not([disabled])')];
    if (!els.length) return;
    e.preventDefault();
    const i = els.indexOf(document.activeElement);
    const d = keys[e.key];
    const next = els[d === 'first' ? 0 : d === 'last' ? els.length - 1 : (i + d + els.length) % els.length];
    next.focus();
    next.click();
  };

  const segments = [];
  visible.forEach((t) => {
    const g = t.group || 'core';
    const last = segments[segments.length - 1];
    if (last && last.group === g) last.tabs.push(t);
    else segments.push({ group: g, tabs: [t] });
  });

  const overflowBadge = overflow.reduce((n, t) => n + (t.badge?.count || 0), 0);

  return (
    <nav className="flex items-start gap-2 mb-6" aria-label="แท็บ">
      <div ref={strip} className="flex-1 min-w-0 overflow-x-auto pb-1">
        <div className="flex items-end gap-4 w-max" role="tablist" aria-label="แท็บหลัก" onKeyDown={onKeyDown}>
          {segments.map((seg, si) => (
            <div key={`${seg.group}-${si}`} className="flex flex-col gap-1" role="presentation">
              {seg.group !== 'core' && <span aria-hidden="true" className="text-[11px] uppercase tracking-wide text-slate-400 px-1">{seg.group}</span>}
              <div className="flex gap-2" role="presentation">
                {seg.tabs.map((item) => (
                  <div key={item.id} className="relative group" role="presentation" onClick={(e) => showHint(e, item)}>
                    <button
                      type="button"
                      onClick={() => item.enabled && onSelect(item.id)}
                      disabled={!item.enabled}
                      title={!item.enabled ? item.tooltip : undefined}
                      role="tab"
                      id={`tab-${item.id}`}
                      aria-selected={activeId === item.id}
                      aria-controls="tabpanel-main"
                      tabIndex={activeId === item.id ? 0 : -1}
                      className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-medium transition-all border text-sm sm:text-base whitespace-nowrap ${
                        activeId === item.id ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : !item.enabled ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed pointer-events-none'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {item.Icon && <span className="w-5 h-5"><item.Icon /></span>}{item.label}
                      {item.badge && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${activeId === item.id ? SEVERITY[item.badge.severity] || SEVERITY.info : 'bg-slate-100 text-slate-600'}`}>{item.badge.count}</span>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {overflow.length > 0 && (
        <OverflowMenu
          label="เพิ่มเติม"
          badgeCount={overflowBadge}
          className="flex-shrink-0 self-end"
          items={overflow.map((t) => ({ key: t.id, label: t.label, Icon: t.Icon, disabled: !t.enabled, tooltip: t.tooltip, badge: t.badge, onClick: () => onSelect(t.id) }))}
        />
      )}
      {hint && createPortal(
        <span role="status" style={{ position: 'fixed', left: hint.left, top: hint.top }} className="z-[70] bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[160px]">{hint.text}</span>,
        document.body,
      )}
    </nav>
  );
}
