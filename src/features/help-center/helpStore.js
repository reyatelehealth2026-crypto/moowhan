// Tiny external store for the help modal (use with useSyncExternalStore). No React import: testable in Node.
let snapshot = { open: false, section: null, anchor: null, diagnostics: false };
const listeners = new Set();
const set = (next) => { snapshot = { ...snapshot, ...next }; listeners.forEach((l) => l()); };

export const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getSnapshot = () => snapshot;
export const closeHelp = () => set({ open: false, diagnostics: false });
export const openDiagnostics = () => set({ diagnostics: true });

/** openHelp('glossary#part-code') | openHelp('shortcuts') | openHelp() */
export const openHelp = (target) => {
  const [section, anchor] = String(target ?? '').split('#');
  set({ open: true, section: section || null, anchor: anchor || null });
};
