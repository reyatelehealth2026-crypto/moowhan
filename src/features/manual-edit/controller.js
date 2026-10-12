// Glue between the pure core and the app actions (still no React): run edits, keep ledger + notes, undo, replay.
import { buildDayColumns } from '../../utils/calendar.js';
import { announce, pushToast } from '../ui-kit/index.js';
import { toasts } from '../ui-kit/toastStore.js';
import { countEditedRows, editKey, mergeLedger, replayEdits } from './edits.js';
import { mergeNotes, monthKeyOf } from './notes.js';
import { editUndo } from './undo.js';

export const ID = 'manual-edit';
export const EMPTY = { ledger: [], notes: [], exportLedger: true };

export const featureData = (state) => ({ ...EMPTY, ...(state?.features?.[ID] || {}) });
export const calendarOf = (state) => (state?.productionMonth ? buildDayColumns(state.productionMonth) : undefined);

/** Rows of the ledger that still describe an edited row (orphans stay in the ledger but are not exported). */
export const liveLedger = (state) => {
  const edited = new Set();
  Object.entries(state?.processedData || {}).forEach(([sheet, rows]) => {
    rows.forEach((r) => { if (r.edited) edited.add(editKey(r, sheet.split(' ')[0])); });
  });
  return featureData(state).ledger.filter((e) => edited.has(e.key));
};

export const editedRowCount = (state) => countEditedRows(state?.processedData);

/** Restores the pending snapshot (processed data + ledger + notes). Returns true when something was restored. */
export const undoLast = (actions) => {
  const snap = editUndo.restore();
  if (!snap) return false;
  actions.commitProcessedData(snap.processedData, [{ action: 'edit', details: 'เลิกทำการแก้ไขล่าสุด' }]);
  actions.setFeatureData(ID, { ledger: snap.ledger, notes: snap.notes });
  announce('เลิกทำการแก้ไขแล้ว');
  return true;
};

/**
 * Applies edit items through actions.updateRowsBatch, records ledger + notes, pushes the single-level undo and
 * shows the 6 s toast. Returns the plan ({ results, applied, ... }).
 */
export const runEdit = (ctx, items, { message = 'แก้ไขแล้ว' } = {}) => {
  const { state, actions } = ctx;
  const data = featureData(state);
  const plan = actions.updateRowsBatch(items, { calendar: calendarOf(state) });
  if (!plan?.applied) return plan;
  const ledger = mergeLedger(data.ledger, plan.results);
  actions.setFeatureData(ID, { ledger, notes: mergeNotes(data.notes, ledger, monthKeyOf(state.productionMonth)) });
  const undoId = editUndo.push({ processedData: plan.previous, ledger: data.ledger, notes: data.notes }, message);
  const toastId = pushToast({ message, tone: 'success', action: { label: 'เลิกทำ', onClick: () => undoLast(actions) } });
  const stop = toasts.subscribe((list) => {
    if (list.some((t) => t.id === toastId)) return;
    stop();
    if (editUndo.peek()?.id === undoId) editUndo.clear();
  });
  announce(`${message} ${plan.applied} รายการ`);
  return plan;
};

/** onProcessed: re-apply the ledger on the freshly processed data and report orphans. */
export const replayAfterProcess = (ctx, result) => {
  const { state, actions } = ctx;
  editUndo.clear(); // a snapshot of the previous processing must not be restorable over new data
  const data = featureData(state);
  if (!data.ledger.length) return null;
  const out = replayEdits(result.processedData, data.ledger, { calendar: calendarOf(state) });
  const logs = out.applied.map((e) => ({ action: 'replayed', plant: e.plant, partNumber: e.partNumber, details: `นำการแก้ไขกลับมาใช้: ${e.cells.map((c) => `${c.label}: ${c.before} → ${c.after}`).join(', ')}${e.reason ? ` (${e.reason})` : ''}` }));
  out.failed.forEach(({ entry, error }) => logs.push({ action: 'warning', plant: entry.plant, partNumber: entry.partNumber, details: `นำการแก้ไขกลับมาใช้ไม่ได้: ${error}` }));
  out.unchanged.forEach((entry) => logs.push({ action: 'replayed', plant: entry.plant, partNumber: entry.partNumber, details: 'ค่าจากไฟล์ใหม่ตรงกับที่แก้ไว้แล้ว ไม่ต้องแก้ซ้ำ' }));
  if (out.orphans.length) {
    const names = out.orphans.map((e) => e.key.replaceAll('|', ' · '));
    const msg = `มีการแก้ไข ${out.orphans.length} รายการที่หาแถวไม่พบ: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` และอีก ${names.length - 5} รายการ` : ''}`;
    logs.push({ action: 'warning', details: msg });
    actions.setNotice(msg);
  }
  if (out.applied.length) actions.commitProcessedData(out.processedData, logs);
  else actions.log(logs);
  actions.setFeatureData(ID, { ledger: out.ledger, notes: mergeNotes(data.notes, out.ledger, monthKeyOf(result.productionMonth)) });
  return out;
};
