// Folder workflow (experimental, File System Access API): pure planning + a never-overwrite writer.
// No DOM/React here; handles are passed in so the logic is testable with fakes.
import { ANALYZE_SHEET, DAILY_SHEETS } from '../../constants.js';
import { categorizeFile } from '../../lib/excel/categorize.js';

const isExcel = (name) => /\.(xls|xlsx)$/i.test(name);
const PREVIOUS_OUTPUT = /^(Production_(Updated|Summary)_.*\.xlsx|run_[\w-]+\.json|forecast_.*\.(csv|json|zip))$/i;

/** true when the sheet list has Analyze and every plant Daily sheet */
export const hasTemplateSheets = (sheets = []) => {
  const set = new Set(sheets);
  return set.has(ANALYZE_SHEET) && DAILY_SHEETS.every((s) => set.has(s));
};

/**
 * @param {{ name: string, size?: number, lastModified?: number, sheets?: string[], [k: string]: any }[]} entries
 *   `sheets` is filled by the caller for .xlsx files (listSheetNames); without it the name decides ("template").
 * @returns {{ template: object|null, sources: object[], previousOutput: object[], skipped: {entry: object, name: string, reason: string}[] }}
 */
export function planFolderImport(entries = []) {
  const skipped = [];
  const previousOutput = [];
  const sources = [];
  const templates = [];
  const skip = (e, reason) => skipped.push({ entry: e, name: e.name, reason });

  [...entries].sort((a, b) => a.name.localeCompare(b.name)).forEach((e) => {
    const name = e.name;
    if (name.startsWith('~$') || name.startsWith('.')) return skip(e, 'ไฟล์ชั่วคราว');
    if (PREVIOUS_OUTPUT.test(name) || /_UNVERIFIED\.xlsx$/i.test(name)) { previousOutput.push(e); return; }
    if (!isExcel(name)) return skip(e, 'ไม่ใช่ไฟล์ Excel');
    if (/\.xlsx$/i.test(name)) {
      const looksLikeTemplate = e.sheets ? hasTemplateSheets(e.sheets) : /template|เทมเพลต/i.test(name);
      if (looksLikeTemplate) { templates.push(e); return; }
    }
    if (categorizeFile(name)) { sources.push(e); return; }
    skip(e, 'จัดประเภทโรงงานไม่ได้ (ชื่อต้องขึ้นต้นด้วย BP, BPK, GW หรือ SR)');
  });

  templates.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0) || a.name.localeCompare(b.name));
  const [template = null, ...others] = templates;
  others.forEach((e) => skip(e, 'มีเทมเพลตอื่นที่ใหม่กว่า'));
  return { template, sources, previousOutput, skipped };
}

/** "Production.xlsx" -> "Production_v2.xlsx" -> "Production_v3.xlsx" ... first name not in `taken`. */
export function uniqueName(name, taken) {
  const used = taken instanceof Set ? taken : new Set(taken);
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let v = 2; v < 1000; v++) {
    const candidate = `${stem}_v${v}${ext}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('ตั้งชื่อไฟล์ไม่ซ้ำไม่ได้');
}

/**
 * Writes `bytes` into a directory handle without ever overwriting: an existing name gets _v2, _v3 ...
 * @returns {Promise<string>} the name that was written
 */
export async function writeNoOverwrite(dirHandle, name, bytes) {
  const taken = new Set();
  for await (const [existing] of dirHandle.entries()) taken.add(existing);
  const finalName = uniqueName(name, taken);
  const handle = await dirHandle.getFileHandle(finalName, { create: true });
  const stream = await handle.createWritable();
  try { await stream.write(bytes); } finally { await stream.close(); }
  return finalName;
}

/** Reads a directory handle into planFolderImport entries (sheet names only for .xlsx candidates). */
export async function scanDirectory(dirHandle, { listSheetNames } = {}) {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    const file = await handle.getFile();
    const entry = { name, size: file.size, lastModified: file.lastModified, file };
    if (listSheetNames && /\.xlsx$/i.test(name) && !PREVIOUS_OUTPUT.test(name)) {
      try { entry.sheets = await listSheetNames(await file.arrayBuffer()); } catch { entry.sheets = []; }
    }
    entries.push(entry);
  }
  return entries;
}

export const canPickFolder = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
