// ==================== TAG ROWS (preview overwrite) ====================
// Tags each row of what will be written (current) against what the template holds now (previous):
// unchanged | new | changed (+ changedCells) and the template rows that disappear (removed).
// This is NOT a forecast comparison: it only shows what an export would overwrite in a sheet.
import { MONTH_KEYS } from '../../constants.js';

const partOf = (r) => String(r.part ?? r.partNumber ?? '').trim();
const dockOf = (r) => String(r.dock ?? r.dockCode ?? r.shippingDock ?? '').trim();
export const rowKey = (r) => `${partOf(r)}|${dockOf(r)}`;

export const tagRows = (previousRows, current) => {
  const pool = new Map(); // key -> unmatched previous rows (kept in order, so duplicate keys pair up 1:1)
  (previousRows || []).forEach((r) => {
    const k = rowKey(r);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(r);
  });
  const counts = { unchanged: 0, new: 0, changed: 0, removed: 0 };
  const rows = (current || []).map((r) => {
    const list = pool.get(rowKey(r));
    const prev = list?.shift();
    if (!prev) { counts.new += 1; return { ...r, tag: 'new', changedCells: [], prev: null }; }
    const changedCells = MONTH_KEYS.filter((m) => (Number(prev[m]) || 0) !== (Number(r[m]) || 0));
    const tag = changedCells.length ? 'changed' : 'unchanged';
    counts[tag] += 1;
    return { ...r, tag, changedCells, prev };
  });
  const removed = [...pool.values()].flat();
  counts.removed = removed.length;
  return { rows, removed, counts };
};
