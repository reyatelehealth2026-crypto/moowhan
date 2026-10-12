// Tiny pub/sub stores for Toasts and the screen-reader live region (no React, testable in Node).
export const TOAST_MS = 6000;
const MAX_TOASTS = 4;

export function createToastStore() {
  let items = [];
  let seq = 0;
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(items));
  return {
    get: () => items,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** push({ message, tone: 'success'|'info'|'warning'|'error', action: {label,onClick}, duration }) -> id */
    push(t) {
      const id = ++seq;
      items = [...items, { tone: 'success', duration: TOAST_MS, ...t, id }].slice(-MAX_TOASTS);
      emit();
      return id;
    },
    dismiss(id) { items = items.filter((x) => x.id !== id); emit(); },
    clear() { items = []; emit(); },
  };
}
export const toasts = createToastStore();
export const pushToast = (t) => toasts.push(t);

export function createLiveStore() {
  let msg = '';
  let n = 0;
  const subs = new Set();
  return {
    get: () => ({ msg, n }),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    announce(text) { msg = String(text ?? ''); n += 1; subs.forEach((f) => f({ msg, n })); },
  };
}
export const live = createLiveStore();
export const announce = (text) => live.announce(text);
