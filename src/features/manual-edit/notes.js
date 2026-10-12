// Reasons store for manual edits. Notes live in state.features['manual-edit'].notes (no localStorage).
// A shared notes module can replace this adapter later: only `featureNotesStore` has to be swapped.

/** Neutralises spreadsheet formula injection and control characters before text reaches a cell. Idempotent. */
export const sanitizeCellText = (value, max = 500) => {
  // eslint-disable-next-line no-control-regex
  let s = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[\r\n]+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max);
  return /^[=+\-@\t]/.test(s) ? `'${s}` : s;
};

/** "202602" from a { year, month } production month; '' when unknown. */
export const monthKeyOf = (pm) => (pm?.year && pm?.month ? `${pm.year}${String(pm.month).padStart(2, '0')}` : '');

export const noteKey = (key) => `row:${key}`;

/** One note per ledger entry that carries a reason. */
export const notesFromLedger = (ledger, month = '') =>
  (ledger || [])
    .filter((e) => e?.reason)
    .map((e) => ({ id: `note-${e.id}`, month, key: noteKey(e.key), text: e.reason, source: 'edit' }));

/** Keep notes written by other sources, rebuild the 'edit' ones from the ledger. */
export const mergeNotes = (existing, ledger, month = '') => [
  ...(existing || []).filter((n) => n?.source !== 'edit'),
  ...notesFromLedger(ledger, month),
];

/**
 * Adapter over the feature data slot: { list(), sync(ledger, month) }.
 * `get()` returns the current slot, `set(patchOrFn)` merges into it (actions.setFeatureData bound to the feature id).
 */
export const featureNotesStore = ({ get, set }) => ({
  list: () => get()?.notes || [],
  sync: (ledger, month) => set((cur) => ({ notes: mergeNotes(cur?.notes, ledger, month) })),
});
