// Pure helpers that turn archive/e-mail intake into File[] and Thai summaries. No DOM/React.
import { expandZip } from './zip.js';
import { parseEml, MSG_ERROR } from './eml.js';

const ext = (name) => (/\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1] || '').toLowerCase();
export const isArchive = (name) => ['zip', 'eml', 'msg'].includes(ext(name));

const toFile = (f) => (typeof File === 'function' ? new File([f.bytes], f.name, { lastModified: f.lastModified }) : f);

/**
 * expandFile(file) -> File[] | null (null = not an archive/e-mail, nothing to do).
 * The returned array carries `.report = { source, skipped:[{name, reason}], warnings:[], error? }`.
 */
export async function expandFile(file, opts = {}) {
  const kind = ext(file?.name);
  if (!['zip', 'eml', 'msg'].includes(kind)) return null;
  let out;
  if (kind === 'msg') out = { files: [], skipped: [], warnings: [], error: MSG_ERROR };
  else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    out = kind === 'zip' ? await expandZip(bytes, opts) : await parseEml(bytes, opts);
  }
  const files = (out.files || []).map(toFile);
  files.report = { source: file.name, skipped: out.skipped || [], warnings: out.warnings || [], error: out.error || null };
  return files;
}

/**
 * Expands every incoming file with `expand` (a feature hook) and remembers where each came from.
 * @returns {Promise<{ files: File[], origin: Map<File, string>, reports: object[] }>}
 */
export async function expandIncoming(incoming, expand) {
  const files = [];
  const origin = new Map();
  const reports = [];
  for (const file of Array.from(incoming || [])) {
    const expanded = expand ? await expand(file) : null;
    if (!Array.isArray(expanded)) { files.push(file); continue; }
    if (expanded.report) reports.push(expanded.report);
    expanded.forEach((f) => { files.push(f); origin.set(f, file.name); });
  }
  return { files, origin, reports };
}

const reasonList = (items) => items.map((s) => `${s.name}${s.reason ? ` (${s.reason})` : ''}`).join(', ');

/**
 * Thai notice for one archive: "แตกไฟล์จาก forecast.zip: เพิ่ม 5 ไฟล์ (...) • ข้าม 2: ..."
 * @param {{source:string, skipped:object[], warnings:string[], error?:string}} report
 * @param {{ added: string[], skipped: {name:string, reason:string}[] }} outcome  names accepted / refused downstream
 */
export function describeIntake(report, { added = [], skipped = [] } = {}) {
  if (report.error) return `แตกไฟล์จาก ${report.source} ไม่ได้: ${report.error}`;
  const allSkipped = [...report.skipped.filter((s) => !/macOS/.test(s.reason)), ...skipped];
  const parts = [`แตกไฟล์จาก ${report.source}: เพิ่ม ${added.length} ไฟล์${added.length ? ` (${added.join(', ')})` : ''}`];
  if (allSkipped.length) parts.push(`ข้าม ${allSkipped.length}: ${reasonList(allSkipped)}`);
  if (report.warnings.length) parts.push(report.warnings.join(' / '));
  return parts.join(' • ');
}
