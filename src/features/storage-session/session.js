// ==================== SESSION (pure) ====================
// Turns the live app state into a compact record and back. processedData is deliberately NOT stored:
// a restore re-runs processAll on the saved source files, then replays the manual edits.
import { MONTH_KEYS } from '../../constants.js';
import { formatMonth } from '../../utils/format.js';

export const SESSION_VERSION = 1;
export const DEFAULT_PREFS = { rememberTemplate: false, templatePromptShown: false, saveSession: false, sessionDays: 7 };
export const SESSION_DAY_CHOICES = [1, 7, 90]; // 24 ชม. / 7 วัน / 90 วัน

export const editKey = (plant, partNumber, dock) => `${plant}|${partNumber}|${dock ?? ''}`;

/** Rows edited by hand -> [{ key, plant, partNumber, dock, n, n1, n2, n3 }] (final values). */
export function collectEdits(processedData) {
  const out = [];
  Object.values(processedData || {}).forEach((rows) => rows.forEach((r) => {
    if (!r.edited) return;
    const e = { key: editKey(r.plant, r.partNumber, r.dockCode), plant: r.plant, partNumber: r.partNumber, dock: r.dockCode ?? '' };
    MONTH_KEYS.forEach((k) => { e[k] = r[k]; });
    out.push(e);
  }));
  return out;
}

const toBuffer = async (file) => (file.buffer instanceof ArrayBuffer ? file.buffer : file.file.arrayBuffer());

/**
 * serializeSession(state, { template, now }) -> { meta, data }
 *  meta: small, shown in the restore banner · data: heavy (file buffers) loaded only on restore.
 */
export async function serializeSession(state, { template = null, now = Date.now() } = {}) {
  const files = [];
  for (const f of state.sourceFiles || []) {
    files.push({ name: f.name, type: f.file?.type || '', lastModified: f.file?.lastModified ?? now, buffer: await toBuffer(f) });
  }
  const edits = collectEdits(state.processedData);
  const fileMeta = (state.sourceFiles || []).map((f) => ({ name: f.name, category: f.category, size: f.size, rowCount: f.rowCount, status: f.status, meta: f.meta ?? null }));
  const productionMonth = state.productionMonth ?? null;
  const meta = {
    version: SESSION_VERSION,
    savedAt: now,
    productionMonth,
    fileCount: files.length,
    editCount: edits.length,
    fileNames: files.map((f) => f.name),
    templateName: template?.name ?? state.template?.name ?? null,
  };
  const data = { version: SESSION_VERSION, savedAt: now, files, fileMeta, edits, changeLog: state.changeLog ?? [], productionMonth };
  return { meta, data };
}

/** deserializeSession(data) -> { files: File[], fileMeta, edits, changeLog, productionMonth, savedAt }. Throws on a damaged record. */
export function deserializeSession(data) {
  if (!data || !Array.isArray(data.files)) throw new Error('ข้อมูลงานที่บันทึกไว้เสียหาย');
  const files = data.files.map((f) => {
    const buf = f.buffer;
    if (!(buf instanceof ArrayBuffer) && !ArrayBuffer.isView(buf)) throw new Error(`ไฟล์ ${f.name} ในงานที่บันทึกไว้เสียหาย`);
    return new File([buf], f.name, { type: f.type || '', lastModified: f.lastModified });
  });
  return {
    files,
    fileMeta: data.fileMeta ?? [],
    edits: data.edits ?? [],
    changeLog: data.changeLog ?? [],
    productionMonth: data.productionMonth ?? null,
    savedAt: data.savedAt ?? null,
  };
}

/** "พบงานค้างเมื่อ 14:02 · เดือนผลิต Feb'26 · 5 ไฟล์ · แก้ไข 2 รายการ" */
export function describeSession(meta, { formatDate }) {
  const sameDay = new Date(meta.savedAt).toDateString() === new Date().toDateString();
  const parts = [`พบงานค้างเมื่อ ${formatDate(meta.savedAt, sameDay ? 'time' : 'long')}`];
  if (meta.productionMonth) parts.push(`เดือนผลิต ${formatMonth(meta.productionMonth)}`);
  parts.push(`${meta.fileCount} ไฟล์`);
  if (meta.editCount) parts.push(`แก้ไข ${meta.editCount} รายการ`);
  return parts.join(' · ');
}
