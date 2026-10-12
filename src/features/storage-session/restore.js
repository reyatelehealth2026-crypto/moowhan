// ==================== RESTORE ====================
// Restore = rebuild Files -> normal addSourceFiles/processAll path -> replay manual edits.
import { editKey } from './session.js';
import { MONTH_KEYS } from '../../constants.js';

/**
 * planEdits(processedData, edits) -> { matched: [{ sheet, rowId, patch, key }], orphans: [key] }
 * Rows are matched by plant|part|dock; duplicates of one key are consumed in order.
 */
export function planEdits(processedData, edits) {
  const index = new Map();
  Object.entries(processedData || {}).forEach(([sheet, rows]) => rows.forEach((r) => {
    const k = editKey(r.plant, r.partNumber, r.dockCode);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push({ sheet, row: r });
  }));
  const matched = [];
  const orphans = [];
  (edits || []).forEach((e) => {
    const k = e.key ?? editKey(e.plant, e.partNumber, e.dock);
    const hit = index.get(k)?.shift();
    if (!hit) { orphans.push(k); return; }
    const patch = {};
    MONTH_KEYS.forEach((m) => { if (e[m] !== undefined) patch[m] = e[m]; });
    matched.push({ sheet: hit.sheet, rowId: hit.row.id, patch, key: k });
  });
  return { matched, orphans };
}

/** Poll until pred(state) holds; resolves false on timeout. getState returns the latest app state. */
export async function waitFor(getState, pred, { timeout = 20000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    if (pred(getState())) return true;
    if (Date.now() - start > timeout) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
}

/**
 * runRestore({ session, templateFile, getCtx })
 *  session: deserializeSession() output · getCtx(): the latest { state, actions }.
 * Reports orphan edits (rows that no longer exist) and logs one "restore" entry.
 */
export async function runRestore({ session, templateFile = null, getCtx, edits: replay = null }) {
  const state = () => getCtx().state;
  const act = () => getCtx().actions;
  if (templateFile) {
    await act().setTemplateFile(templateFile);
    await waitFor(state, (s) => !!s.template);
  }
  act().addSourceFiles(session.files);
  const loaded = await waitFor(state, (s) => s.sourceFiles.length >= session.files.length);
  if (!loaded) return { ok: false, error: 'โหลดไฟล์ต้นทางไม่สำเร็จ' };
  const result = await act().processAll();
  if (!result) return { ok: false, error: 'ประมวลผลงานที่กู้คืนไม่สำเร็จ' };
  await waitFor(state, (s) => s.processedData === result.processedData);

  const edits = replay ?? session.edits;
  const { matched, orphans } = planEdits(result.processedData, edits);
  let applied = 0;
  for (const m of matched) {
    const before = state().processedData;
    if (act().updateRowValues(m.sheet, m.rowId, m.patch, 'กู้คืนงาน')) {
      applied++;
      await waitFor(state, (s) => s.processedData !== before);
    }
  }
  const detail = [`กู้คืนไฟล์ ${session.files.length} ไฟล์`, `แก้ไขซ้ำ ${applied}/${edits.length} รายการ`];
  if (orphans.length) detail.push(`หาแถวไม่พบ ${orphans.length} รายการ (${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? ' ...' : ''})`);
  act().log({ action: 'restore', details: `กู้คืนงาน: ${detail.join(' • ')}` });
  if (orphans.length) act().setNotice(`กู้คืนงานแล้ว แต่การแก้ไข ${orphans.length} รายการไม่มีแถวตรงกันในไฟล์ จึงไม่ได้นำมาใช้: ${orphans.slice(0, 5).join(', ')}`);
  return { ok: true, applied, orphans, result };
}
