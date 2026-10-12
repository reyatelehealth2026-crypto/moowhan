// ==================== READ PREVIOUS ROUND (baseline adapters) ====================
// Every adapter returns a baseline:
//   { rows:[{plant,part,dock,n,n1,n2,n3}], monthCandidates:[{source,value:{year,month}}],
//     month:{year,month}|null, confidence:'high'|'low', label, source, warnings:[] }
// xlsx/jszip are only reached through the lazy barrel (dynamic import inside the functions), so this
// module is safe to import statically from UI code.
import { DAILY_SHEETS, PLANTS, dailySheetName } from '../../constants.js';
import { rowsFromProcessed } from './compare.js';

const loadExcel = () => import('../../lib/excel/index.js');

export const BASELINE_SCHEMA_VERSION = 1;
export const BASELINE_KIND = 'moowhan-forecast-baseline';
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Dec'25" / "Production Month:Dec'25" -> {year:2025, month:12} | null */
export const parseMonYY = (text) => {
  const m = String(text ?? '').match(/([A-Za-z]{3})[A-Za-z]*\s*['’]\s*(\d{2})\b/);
  if (!m) return null;
  const idx = EN_MONTHS.indexOf(m[1].toLowerCase());
  return idx === -1 ? null : { year: 2000 + Number(m[2]), month: idx + 1 };
};

const sameMonth = (a, b) => !!a && !!b && a.year === b.year && a.month === b.month;
const monthKey = (m) => (m ? m.year * 12 + m.month : 0);

const toBaselineRow = (plant, r) => ({
  plant,
  part: r.partNumber,
  dock: String(r.dockCode || r.shippingDock || '').trim(),
  n: r.n, n1: r.n1, n2: r.n2, n3: r.n3,
});

// "Production Month" labels in the first rows of By Plant / Summary (display text such as Dec'25).
// They are only suggestions: those cells are often stale, so the user must confirm the month.
const monthCandidatesFromSheets = (rawSheets) => {
  const out = [];
  ['By Plant', 'Summary'].forEach((name) => {
    const aoa = rawSheets[name];
    if (!aoa) return;
    for (let r = 0; r < Math.min(aoa.length, 10); r++) {
      const row = aoa[r] || [];
      const at = row.findIndex((c) => /^production month/i.test(String(c ?? '').trim()));
      if (at === -1) continue;
      const cell = row.slice(at, at + 4).map(parseMonYY).find(Boolean);
      if (cell) out.push({ source: `${name} (Production Month)`, value: cell });
      break;
    }
  });
  return out;
};

/**
 * (a) a previous result workbook, or (c) the template's own Daily sheets.
 * Reads the four "<Plant> Daily" sheets with extractSourceRows. Daily!B4 is never used as the month.
 */
export const readPreviousWorkbook = async (buffer, { label = 'สมุดผลลัพธ์รอบก่อน', source = 'workbook' } = {}) => {
  const excel = await loadExcel();
  let rawSheets;
  try {
    ({ rawSheets } = excel.workbookToRawSheets(buffer));
  } catch (err) {
    throw new Error(`อ่านไฟล์ Excel ของรอบก่อนไม่ได้: ${err.message}`);
  }
  const rows = [];
  const warnings = [];
  let found = 0;
  PLANTS.forEach((plant) => {
    const sheet = dailySheetName(plant);
    const aoa = rawSheets[sheet];
    if (!aoa) { warnings.push(`ไม่พบชีต "${sheet}" ในไฟล์รอบก่อน`); return; }
    const headerRow = excel.findHeaderRow(aoa, -1);
    if (headerRow < 0 || String(aoa[headerRow]?.[0] ?? '').trim().toUpperCase() !== 'PART NUMBER') {
      throw new Error(`ชีต "${sheet}" ไม่มีหัวตาราง PART NUMBER จึงอ่านเป็นข้อมูลรอบก่อนไม่ได้`);
    }
    found += 1;
    excel.extractSourceRows(aoa).rows.forEach((r) => rows.push(toBaselineRow(plant, r)));
  });
  if (!found) throw new Error(`ไม่พบชีต ${DAILY_SHEETS.map((s) => `"${s}"`).join(', ')} ในไฟล์นี้ จึงใช้เป็นข้อมูลรอบก่อนไม่ได้`);
  if (!rows.length) throw new Error('ชีต Daily ของไฟล์นี้ยังไม่มีแถวข้อมูล จึงไม่มีอะไรให้เทียบ');
  return { rows, monthCandidates: monthCandidatesFromSheets(rawSheets), month: null, confidence: 'low', label, source, warnings };
};

/** (b) previous TMT .xls files (same reader as the current round). files: [{ name, buffer }] */
export const readPreviousTmt = async (files, { label = 'ไฟล์ TMT รอบก่อน' } = {}) => {
  const excel = await loadExcel();
  const rows = [];
  const months = [];
  const names = [];
  for (const f of files || []) {
    const plant = excel.categorizeFile(f.name);
    if (!plant) throw new Error(`ไม่สามารถจัดประเภทไฟล์ "${f.name}" ได้ ชื่อไฟล์ต้องขึ้นต้นด้วย BP, BPK, GW หรือ SR`);
    let parsed;
    try { parsed = excel.readSourceBuffer(f.buffer); } catch (err) { throw new Error(`อ่านไฟล์ "${f.name}" ไม่ได้: ${err.message}`); }
    if (!parsed.rows.length) throw new Error(`ไฟล์ "${f.name}" ไม่พบแถวข้อมูล (ตรวจสอบแถวหัวตาราง "PART NUMBER")`);
    parsed.rows.forEach((r) => rows.push(toBaselineRow(plant, r)));
    if (parsed.meta.productionMonth) months.push({ source: f.name, value: parsed.meta.productionMonth });
    names.push(f.name);
  }
  if (!rows.length) throw new Error('ไม่ได้เลือกไฟล์ TMT ของรอบก่อน');
  const distinct = months.filter((m, i) => months.findIndex((x) => sameMonth(x.value, m.value)) === i);
  const month = distinct.length === 1 ? distinct[0].value : null;
  const warnings = distinct.length > 1 ? ['ไฟล์รอบก่อนมี PRODUCTION MONTH ไม่ตรงกัน กรุณาเลือกเดือนเอง'] : [];
  return { rows, monthCandidates: distinct, month, confidence: month ? 'high' : 'low', label: `${label} (${names.length} ไฟล์)`, source: 'tmt', warnings };
};

/** (d) in-memory snapshot of the previous processAll result. */
export const baselineFromProcessed = (processedData, { month = null, label = 'รอบประมวลผลก่อนหน้า', source = 'snapshot' } = {}) => ({
  rows: rowsFromProcessed(processedData),
  monthCandidates: month ? [{ source: 'รอบก่อนหน้า', value: month }] : [],
  month: month || null,
  confidence: month ? 'high' : 'low',
  label, source, warnings: [],
});

/** Auto-detect an uploaded file's buffer: JSON baseline, xlsx workbook or a single TMT .xls. */
export const readPrevious = async (buffer, { name = '' } = {}) => {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x7b) return loadForecastJson(new TextDecoder().decode(bytes));
  const excel = await loadExcel();
  if (excel.isZipBuffer(buffer)) return readPreviousWorkbook(buffer, { label: name || 'สมุดผลลัพธ์รอบก่อน' });
  return readPreviousTmt([{ name, buffer }], { label: name || 'ไฟล์ TMT รอบก่อน' });
};

// ---------- (e) JSON baseline exported by this app ----------
export const baselineToJson = (baseline) => JSON.stringify({
  kind: BASELINE_KIND,
  schemaVersion: BASELINE_SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  label: baseline.label || '',
  month: baseline.month || null,
  rows: baseline.rows,
}, null, 1);

// The JSON of "ส่งออกข้อมูล (CSV/JSON)" (flat-export, schemaVersion 1) has no `kind`: rows carry partNumber/dockCode and
// the month sits in productionMonth. It is accepted as a baseline too, so last round's export can be compared as is.
const isFlatExport = (d) => !!d && typeof d === 'object' && !d.kind && Array.isArray(d.rows) && Array.isArray(d.files) && 'productionMonth' in d;
const fromFlatExport = (d) => ({
  kind: BASELINE_KIND,
  schemaVersion: d.schemaVersion === 1 ? BASELINE_SCHEMA_VERSION : d.schemaVersion,
  label: 'ไฟล์ส่งออก JSON รอบก่อน',
  month: d.productionMonth ? { year: d.productionMonth.year, month: d.productionMonth.month } : null,
  rows: d.rows.map((r) => ({ plant: r?.plant, part: typeof r?.partNumber === 'string' ? r.partNumber : r?.part, dock: r?.dockCode ?? r?.dock, n: r?.n, n1: r?.n1, n2: r?.n2, n3: r?.n3 })),
});

/** Parse + validate a JSON baseline (this app's baseline export or its flat-export JSON). Throws a Thai Error for anything unsupported. */
export const loadForecastJson = (text) => {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('ไฟล์ JSON อ่านไม่ได้ (รูปแบบไม่ถูกต้อง) ใช้ไฟล์ baseline หรือไฟล์ส่งออก JSON ที่ได้จากแอปนี้'); }
  if (isFlatExport(data)) data = fromFlatExport(data);
  if (!data || typeof data !== 'object' || data.kind !== BASELINE_KIND) throw new Error('ไม่ใช่ไฟล์ baseline ของแอปนี้ ใช้ไฟล์ JSON ที่ส่งออกจากปุ่ม "ส่งออก baseline" หรือไฟล์ JSON จาก "ส่งออกข้อมูล (CSV/JSON)"');
  if (data.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new Error(`ไฟล์ baseline เวอร์ชัน ${data.schemaVersion ?? 'ไม่ระบุ'} แอปนี้รองรับเฉพาะเวอร์ชัน ${BASELINE_SCHEMA_VERSION} กรุณาส่งออกไฟล์ใหม่จากแอปเวอร์ชันเดียวกัน`);
  }
  if (!Array.isArray(data.rows) || !data.rows.length) throw new Error('ไฟล์ baseline ไม่มีแถวข้อมูล');
  const rows = data.rows.map((r, i) => {
    if (!r || typeof r.part !== 'string' || !PLANTS.includes(r.plant)) throw new Error(`ไฟล์ baseline แถวที่ ${i + 1} ไม่ถูกต้อง (ต้องมี plant และ part)`);
    return { plant: r.plant, part: r.part, dock: String(r.dock ?? ''), n: Number(r.n) || 0, n1: Number(r.n1) || 0, n2: Number(r.n2) || 0, n3: Number(r.n3) || 0 };
  });
  const month = data.month && Number.isInteger(data.month.year) && data.month.month >= 1 && data.month.month <= 12 ? { year: data.month.year, month: data.month.month } : null;
  return { rows, monthCandidates: month ? [{ source: 'ไฟล์ baseline', value: month }] : [], month, confidence: month ? 'high' : 'low', label: data.label || 'baseline (JSON)', source: 'json', warnings: [] };
};

export { monthKey };
