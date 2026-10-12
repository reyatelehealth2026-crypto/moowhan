import { useEffect, useRef, useState } from 'react';
import { toasts as defaultStore } from '../toastStore.js';

const TONE = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  info: 'border-blue-300 bg-blue-50 text-blue-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-900',
};

function Toast({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(toast.duration);
  const started = useRef(0);
  useEffect(() => {
    if (paused || !toast.duration) return undefined;
    started.current = Date.now();
    const t = setTimeout(onDismiss, left.current);
    return () => { clearTimeout(t); left.current = Math.max(500, left.current - (Date.now() - started.current)); };
  }, [paused, toast.duration, onDismiss]);
  return (
    <div
      className={`flex items-start gap-3 border rounded-xl shadow-lg px-4 py-3 text-sm ${TONE[toast.tone] || TONE.info}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="flex-1 min-w-0 break-words">{toast.message}</span>
      {toast.action && (
        <button type="button" onClick={() => { toast.action.onClick?.(); onDismiss(); }} className="font-semibold underline min-h-[32px]">{toast.action.label}</button>
      )}
      <button type="button" onClick={onDismiss} aria-label="ปิดการแจ้งเตือน" className="opacity-60 hover:opacity-100 px-1">✕</button>
    </div>
  );
}

/** Bottom-right stack. Success/info go here; errors stay in Banner. */
export default function ToastRegion({ store = defaultStore }) {
  const [items, setItems] = useState(store.get());
  useEffect(() => store.subscribe(setItems), [store]);
  return (
    <div role="status" aria-live="polite" className="no-print fixed z-[70] bottom-3 right-3 left-3 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto"><Toast toast={t} onDismiss={() => store.dismiss(t.id)} /></div>
      ))}
    </div>
  );
}
