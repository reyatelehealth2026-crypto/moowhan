// Tiny external store for the export dialog, so App's gated exportExcel (and other features) can open it
// without prop drilling. Only the dialog host (index.jsx) renders from it.
let state = { open: false, view: 'gate', issues: [], busy: false, options: null };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const exportDialog = {
  get: () => state,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  /** view: 'gate' (issues found), 'options' (ตัวเลือก button), 'result' (after download) */
  open: (view, patch = {}) => { state = { ...state, open: true, view, ...patch }; emit(); },
  patch: (patch) => { state = { ...state, ...patch }; emit(); },
  close: () => { state = { ...state, open: false, busy: false }; emit(); },
};
