// ==================== VERIFY EXPORT ====================
// Re-opens the exported .xlsx (zip) and checks it against what we meant to write. Pure data in/out
// (no DOM); loaded lazily through the barrel because it needs jszip.
//
//   V01 rows per sheet (+ part-number order)      V06 extra sheets present
//   V02 N..N+3 totals per plant                   V08 autoFilter / pivot ranges cover the new rows
//   V03 written cells (+ cellWrites)              V09 formula count unchanged
//   V04 Analyze rows + plant column               V10 cellXfs of the template kept as a prefix
//   V05 zip parts, pivot refreshOnLoad, fullCalcOnLoad
//
// `ok: null` = not applicable / could not be checked (e.g. V05, V08-V10 in fallback mode).
import JSZip from 'jszip';
import {
  cellText, decodeXml, findRowWithText, lastColWithText, listSheets, loadSharedStrings, parseSheet, readText,
} from './templatePatcher.js';
import { buildAnalyzeRows } from './aggregate.js';
import { ANALYZE_SHEET, DAILY_SHEETS, MONTH_HEADERS, MONTH_KEYS } from '../../constants.js';
import { getColumnIndex } from '../../utils/format.js';

export const SAMPLE_THRESHOLD = 2000;
const SAMPLE_SIZE = 400;

const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const FORMULA_RE = /<f[\s>/]/g;

// deterministic PRNG so a sample is reproducible
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pickSample = (n, size, seed) => {
  if (n <= size) return Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(seed);
  const set = new Set([0, n - 1]);
  while (set.size < size) set.add(Math.floor(rnd() * n));
  return [...set].sort((a, b) => a - b);
};

const hasValue = (cell) => !!cell && !cell.hasFormula && (cell.t === 'inlineStr' || /<v>/.test(cell.inner || ''));
const numberOf = (cell, sst) => {
  const v = Number(cellText(cell, sst));
  return Number.isFinite(v) ? v : 0;
};

/**
 * @param {ArrayBuffer} buffer  the exported workbook
 * @param {object} opts
 * @param {Record<string, object[]>} opts.processedData
 * @param {object[]} [opts.analyzeRows]  default: buildAnalyzeRows(processedData)
 * @param {{ name: string, aoa: any[][] }[]} [opts.extraSheets]
 * @param {ArrayBuffer} [opts.templateBuffer]  needed for V05 (pivot count), V09, V10
 * @param {object} [opts.report]  report returned by buildExport (mode, patched, cellWrites, skippedSheets, overflow)
 * @param {boolean} [opts.sample]  force (true) or forbid (false) sampling; default: sample above 2000 rows
 * @returns {Promise<{ ok: boolean, sampled: boolean, mode: string, checks: object[], failed: object[], elapsedMs: number }>}
 */
export const verifyExport = async (buffer, {
  processedData = {}, analyzeRows, extraSheets = [], templateBuffer = null, report = null, sample,
} = {}) => {
  const started = Date.now();
  const mode = report?.mode === 'fallback' ? 'fallback' : 'template';
  const templateMode = mode === 'template';
  const checks = [];
  const add = (c) => checks.push({ ok: null, expected: null, actual: null, sheet: null, advisory: false, ...c });

  const zip = await JSZip.loadAsync(buffer);
  const sheetList = await listSheets(zip);
  const sst = await loadSharedStrings(zip);
  const patchedBy = new Map((report?.patched || []).map((p) => [p.sheet, p]));
  const skipped = new Set([...(report?.skipped || []), ...(report?.skippedSheets || []).map((s) => s.name)]);

  const totalRows = Object.values(processedData).reduce((n, rows) => n + (rows?.length || 0), 0);
  const sampled = sample ?? totalRows > SAMPLE_THRESHOLD;

  const cache = new Map();
  const load = async (name) => {
    if (cache.has(name)) return cache.get(name);
    const entry = sheetList.find((s) => s.name === name);
    let out = null;
    if (entry?.path && zip.file(entry.path)) {
      const xml = await readText(zip, entry.path);
      out = { xml, parsed: parseSheet(xml), path: entry.path };
    }
    cache.set(name, out);
    return out;
  };

  // ---------- locate the table of a Daily sheet in the OUTPUT ----------
  const dailyLayout = (parsed) => {
    const headerRow = findRowWithText(parsed.rows, sst, 1, 'PART NUMBER');
    if (!headerRow) return null;
    const header = parsed.rows.get(headerRow);
    const nCols = MONTH_HEADERS.map((t) => lastColWithText(header, sst, t));
    if (!nCols.every(Boolean)) return null;
    const startRow = headerRow + 1;
    const zone = new Set([1, 2, 3, 4, 5, 6, 7, 8, ...nCols]);
    let endRow = Infinity; // first formula row stops the table
    for (const row of [...parsed.rows.values()].sort((a, b) => a.r - b.r)) {
      if (row.r < startRow) continue;
      if ([...row.cells.values()].some((c) => c.hasFormula && zone.has(c.col))) { endRow = row.r - 1; break; }
    }
    return { headerRow, startRow, endRow, nCols, lastCol: nCols[3] };
  };

  const dataRowsOf = (parsed, layout) =>
    [...parsed.rows.values()].filter((row) => row.r >= layout.startRow && row.r <= layout.endRow).sort((a, b) => a.r - b.r);

  // ---------- V01 / V02 / V03 per plant sheet ----------
  const lastDataRows = {};
  for (const sheet of DAILY_SHEETS) {
    const rows = processedData[sheet];
    if (!rows?.length) continue;
    const entry = patchedBy.get(sheet);
    const written = entry ? entry.rows : rows.length;
    const loaded = await load(sheet);
    if (!loaded || skipped.has(sheet)) {
      add({ id: 'V01', label: `จำนวนแถว ${sheet}`, sheet, ok: skipped.has(sheet) ? null : false, expected: written, actual: 0, detail: loaded ? 'ชีตนี้ถูกข้าม' : 'ไม่พบชีตในไฟล์' });
      continue;
    }
    const layout = dailyLayout(loaded.parsed);
    if (!layout) {
      add({ id: 'V01', label: `จำนวนแถว ${sheet}`, sheet, ok: false, expected: written, actual: 0, detail: 'ไม่พบแถวหัวตาราง (PART NUMBER / N..N+3)' });
      continue;
    }
    const startRow = entry?.startRow ?? layout.startRow;
    const data = dataRowsOf(loaded.parsed, { ...layout, startRow });
    const filled = data.filter((r) => !blank(cellText(r.cells.get(1), sst)));
    lastDataRows[sheet] = filled.length ? filled[filled.length - 1].r : startRow - 1;

    // V01: row count + part-number order (all rows, or a seeded sample when large)
    const idx = sampled ? pickSample(written, SAMPLE_SIZE, written * 2654435761 + sheet.length) : Array.from({ length: written }, (_, i) => i);
    const byRow = new Map(data.map((r) => [r.r, r]));
    const wrong = [];
    for (const i of idx) {
      const want = String(rows[i].rawRow?.[0] ?? rows[i].partNumber ?? '').trim();
      const got = cellText(byRow.get(startRow + i)?.cells.get(1), sst).trim();
      if (want !== got) wrong.push(startRow + i);
    }
    add({
      id: 'V01', label: `จำนวนแถวและลำดับ Part Number — ${sheet}`, sheet,
      ok: filled.length === written && !wrong.length, expected: written, actual: filled.length,
      detail: wrong.length ? `Part Number ไม่ตรงที่แถว ${wrong.slice(0, 5).join(', ')}` : undefined,
    });

    // V02: totals of N..N+3 read back from the file
    const expAll = MONTH_KEYS.map((k) => rows.slice(0, written).reduce((s, r) => s + (Number(r[k]) || 0), 0));
    const actAll = layout.nCols.map((col) => filled.reduce((s, r) => s + numberOf(r.cells.get(col), sst), 0));
    const bad = expAll.findIndex((v, i) => v !== actAll[i]);
    const at = bad === -1 ? 0 : bad;
    add({
      id: 'V02', label: `ผลรวม N..N+3 — ${sheet}`, sheet, ok: bad === -1,
      expected: expAll[at], actual: actAll[at], expectedAll: expAll, actualAll: actAll,
      detail: bad === -1 ? undefined : `${MONTH_HEADERS[bad]} ในไฟล์ไม่ตรงกับข้อมูลที่ประมวลผล`,
    });

    // V03: number of value cells written
    if (entry && Number.isFinite(entry.cells)) {
      let count = 0;
      for (const r of filled) for (const [col, cell] of r.cells) if (col <= layout.lastCol && hasValue(cell)) count++;
      add({ id: 'V03', label: `จำนวนเซลล์ที่เขียน — ${sheet}`, sheet, ok: count === entry.cells, expected: entry.cells, actual: count });
    } else {
      add({ id: 'V03', label: `จำนวนเซลล์ที่เขียน — ${sheet}`, sheet, ok: null });
    }
  }

  // cellWrites reported as written must read back
  const writes = (report?.cellWrites || []).filter((w) => w.status === 'written');
  if (writes.length) {
    const wrong = [];
    for (const w of writes) {
      const loaded = await load(w.sheet);
      const m = String(w.ref).match(/^([A-Z]+)(\d+)$/);
      const cell = loaded && m ? loaded.parsed.rows.get(Number(m[2]))?.cells.get(getColumnIndex(m[1])) : null;
      const got = cell ? cellText(cell, sst) : '';
      const want = w.after instanceof Date ? '' : String(w.after ?? '');
      if (!cell || (want !== '' && got !== want && Number(got) !== Number(want))) wrong.push(`${w.sheet}!${w.ref}`);
    }
    add({ id: 'V03', label: 'เซลล์หัวเทมเพลตที่เขียน (cellWrites)', ok: !wrong.length, expected: writes.length, actual: writes.length - wrong.length, detail: wrong.length ? `ไม่พบค่าที่ ${wrong.slice(0, 5).join(', ')}` : undefined });
  }

  // ---------- V04 Analyze ----------
  const analyze = analyzeRows || buildAnalyzeRows(processedData);
  if (analyze.length && !skipped.has(ANALYZE_SHEET)) {
    const loaded = await load(ANALYZE_SHEET);
    const entry = patchedBy.get(ANALYZE_SHEET);
    let startRow = 1;
    let plantCol = 1;
    if (loaded && templateMode) {
      const headerRow = findRowWithText(loaded.parsed.rows, sst, 2, 'PART NUMBER');
      const n3 = headerRow ? lastColWithText(loaded.parsed.rows.get(headerRow), sst, 'N+3') : null;
      startRow = entry?.startRow ?? (headerRow ? headerRow + 1 : 3);
      plantCol = n3 ? n3 + 1 : entry?.plantCol ? getColumnIndex(entry.plantCol) : 138;
    }
    if (!loaded) {
      add({ id: 'V04', label: 'จำนวนแถว Analyze', sheet: ANALYZE_SHEET, ok: false, expected: entry?.rows ?? analyze.length, actual: 0, detail: 'ไม่พบชีต Analyze' });
    } else {
      const plants = new Map();
      let count = 0;
      for (const row of loaded.parsed.rows.values()) {
        if (row.r < startRow) continue;
        const p = cellText(row.cells.get(plantCol), sst).trim();
        if (!p) continue;
        count++;
        plants.set(p, (plants.get(p) || 0) + 1);
      }
      const expected = entry ? entry.rows : analyze.length;
      const truncated = expected !== analyze.length;
      let ok = count === expected;
      let detail;
      if (ok && !truncated) {
        const want = new Map();
        analyze.forEach((r) => want.set(r.plant, (want.get(r.plant) || 0) + 1));
        const diff = [...want].filter(([p, n]) => plants.get(p) !== n).map(([p, n]) => `${p} ควรมี ${n} แถว พบ ${plants.get(p) || 0}`);
        if (diff.length) { ok = false; detail = diff.join(', '); }
      }
      add({ id: 'V04', label: 'จำนวนแถวและคอลัมน์ Plant — Analyze', sheet: ANALYZE_SHEET, ok, expected, actual: count, detail });
    }
  }

  // ---------- V06 extra sheets ----------
  for (const extra of extraSheets) {
    if (!extra?.name || skipped.has(extra.name)) continue;
    const loaded = await load(extra.name);
    const want = (extra.aoa || []).filter((row) => Array.isArray(row) && row.some((v) => !blank(v))).length;
    if (!loaded) { add({ id: 'V06', label: `ชีตเสริม ${extra.name}`, sheet: extra.name, ok: false, expected: want, actual: 0, detail: 'ไม่พบชีตในไฟล์' }); continue; }
    const got = [...loaded.parsed.rows.values()].filter((r) => [...r.cells.values()].some((c) => hasValue(c))).length;
    add({ id: 'V06', label: `ชีตเสริม ${extra.name}`, sheet: extra.name, ok: got === want, expected: want, actual: got });
  }

  // ---------- template-only structure checks ----------
  const na = (id, label) => add({ id, label, ok: null, detail: 'ไม่มีเทมเพลต .xlsx — ข้ามการตรวจนี้' });
  if (!templateMode) {
    na('V05', 'โครงสร้างไฟล์ (pivot / คำนวณใหม่เมื่อเปิด)');
    na('V08', 'ช่วง autoFilter / pivot ครอบคลุมแถวใหม่');
    na('V09', 'จำนวนสูตรไม่เปลี่ยน');
    na('V10', 'สไตล์ของเทมเพลตคงเดิม');
  } else {
    const tzip = templateBuffer ? await JSZip.loadAsync(templateBuffer) : null;
    const partsOf = (z, re) => Object.keys(z.files).filter((p) => re.test(p));
    const pivotRe = /^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/;

    // V05
    const missing = ['[Content_Types].xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml'].filter((p) => !zip.file(p));
    const wbXml = (await readText(zip, 'xl/workbook.xml')) || '';
    const calc = /<calcPr\b[^>]*\bfullCalcOnLoad="1"/.test(wbXml);
    const defs = partsOf(zip, pivotRe);
    let notRefresh = 0;
    for (const p of defs) if (!/<pivotCacheDefinition\b[^>]*\brefreshOnLoad="1"/.test(await readText(zip, p))) notRefresh++;
    const tPivots = tzip ? partsOf(tzip, pivotRe).length : defs.length;
    const problems = [
      ...missing.map((p) => `ขาด ${p}`),
      ...(calc ? [] : ['ไม่ได้ตั้ง fullCalcOnLoad']),
      ...(notRefresh ? [`pivot ${notRefresh} ตัวไม่ได้ตั้ง refreshOnLoad`] : []),
      ...(defs.length !== tPivots ? [`จำนวน pivot cache ${defs.length} ต่างจากเทมเพลต ${tPivots}`] : []),
    ];
    add({ id: 'V05', label: 'โครงสร้างไฟล์ (pivot / คำนวณใหม่เมื่อเปิด)', ok: !problems.length, expected: `${tPivots} pivot`, actual: `${defs.length} pivot`, detail: problems.join(', ') || undefined });

    // V08: autoFilter and pivot source ranges reach the last written row
    const fails = [];
    let checked = 0;
    const lastOf = { ...lastDataRows };
    const analyzeEntry = patchedBy.get(ANALYZE_SHEET);
    if (analyzeEntry?.rows) lastOf[ANALYZE_SHEET] = (analyzeEntry.startRow ?? 3) + analyzeEntry.rows - 1;
    for (const [sheet, last] of Object.entries(lastOf)) {
      const loaded = await load(sheet);
      const af = loaded?.xml.match(/<autoFilter ref="[A-Z]+\d+:[A-Z]+(\d+)"/);
      if (af) { checked++; if (Number(af[1]) < last) fails.push(`autoFilter ${sheet} สิ้นสุดแถว ${af[1]} (ข้อมูลถึงแถว ${last})`); }
    }
    for (const p of defs) {
      const xml = await readText(zip, p);
      for (const m of xml.matchAll(/<worksheetSource\b[^>]*\/>/g)) {
        const sheet = decodeXml(attr(m[0], 'sheet') ?? '');
        const ref = attr(m[0], 'ref')?.match(/:[A-Z]+(\d+)$/);
        if (!ref || lastOf[sheet] === undefined) continue;
        checked++;
        if (Number(ref[1]) < lastOf[sheet]) fails.push(`pivot source ${sheet} สิ้นสุดแถว ${ref[1]} (ข้อมูลถึงแถว ${lastOf[sheet]})`);
      }
    }
    add({ id: 'V08', label: 'ช่วง autoFilter / pivot ครอบคลุมแถวใหม่', ok: checked ? !fails.length : null, expected: checked, actual: checked - fails.length, detail: fails.join(', ') || (checked ? undefined : 'ไม่มีช่วงให้ตรวจ') });

    // V09 / V10 need the original template
    if (!tzip) {
      na('V09', 'จำนวนสูตรไม่เปลี่ยน');
      na('V10', 'สไตล์ของเทมเพลตคงเดิม');
    } else {
      const tSheets = await listSheets(tzip);
      const diffs = [];
      let total = 0;
      let totalAfter = 0;
      for (const ts of tSheets) {
        const out = sheetList.find((s) => s.name === ts.name);
        if (!out?.path || !ts.path || !zip.file(out.path) || !tzip.file(ts.path)) continue;
        const before = ((await readText(tzip, ts.path)).match(FORMULA_RE) || []).length;
        const after = ((await load(ts.name))?.xml.match(FORMULA_RE) || []).length;
        total += before;
        totalAfter += after;
        if (before !== after) diffs.push(`${ts.name} ${before}→${after}`);
      }
      add({ id: 'V09', label: 'จำนวนสูตรไม่เปลี่ยน', ok: !diffs.length, expected: total, actual: totalAfter, detail: diffs.join(', ') || undefined });

      const xfs = (xml) => {
        const inner = (xml || '').match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
        return [...inner.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
      };
      const before = xfs(await readText(tzip, 'xl/styles.xml'));
      const after = xfs(await readText(zip, 'xl/styles.xml'));
      const firstDiff = before.findIndex((x, i) => after[i] !== x);
      add({
        id: 'V10', label: 'สไตล์ของเทมเพลตคงเดิม', ok: firstDiff === -1 && after.length >= before.length,
        expected: before.length, actual: after.length,
        detail: firstDiff === -1 ? undefined : `สไตล์ลำดับที่ ${firstDiff} ถูกเปลี่ยน`,
      });
    }
  }

  return {
    ok: checks.every((c) => c.ok !== false),
    sampled, mode, checks, failed: checks.filter((c) => c.ok === false), elapsedMs: Date.now() - started,
  };
};
