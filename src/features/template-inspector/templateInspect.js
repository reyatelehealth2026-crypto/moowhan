// ==================== TEMPLATE INSPECTOR ====================
// Reads the template zip ONCE (a single JSZip.loadAsync) and returns facts about it: sheets, header rows,
// write capacity, pivots, month labels, file kind, generator, fingerprint ... It never decides policy
// (rules live in qa-engine / export-gate) and never opens a dialog. Pure: no DOM / React.
//
// NOTE: pulls jszip in through templatePatcher, so only load this module via the lazy barrel
// (src/lib/excel/index.js) — never statically from a component or from state.
import { ANALYZE_SHEET, DAILY_SHEETS, TEMPLATE } from '../../constants.js';
import { getColumnIndex, getColumnLetter } from '../../utils/format.js';
import {
  cellText, decodeXml, findRowWithText, lastColWithText, listSheets, loadSharedStrings, parseSheet, readText,
} from '../../lib/excel/templatePatcher.js';

const N_LABELS = ['N', 'N+1', 'N+2', 'N+3'];
const REQUIRED_SHEETS = [...DAILY_SHEETS, ANALYZE_SHEET];
const BY_PLANT = 'By Plant';
const TOTAL = 'Total';
// Analyze dock/suffix lookup block "EN:ER" (EN part, EO plant, EP dock, EQ key, ER packing)
const DOCK_COLS = { part: getColumnIndex('EN'), plant: getColumnIndex('EO'), dock: getColumnIndex('EP'), key: getColumnIndex('EQ'), packing: getColumnIndex('ER') };

const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const norm = (s) => String(s ?? '').trim();

// ---------- tiny helpers ----------
const parseRef = (ref) => {
  const m = String(ref).match(/^\$?([A-Z]+)\$?(\d+)$/);
  return m ? { col: getColumnIndex(m[1]), row: Number(m[2]) } : null;
};
// "A13:EF21" | "A1" -> { c1, r1, c2, r2 } | null
const parseRange = (ref) => {
  const [a, b = a] = String(ref).split(':');
  const p1 = parseRef(a);
  const p2 = parseRef(b);
  return p1 && p2 ? { c1: p1.col, r1: p1.row, c2: p2.col, r2: p2.row } : null;
};
// 'xl/worksheets' + '../comments1.xml' -> 'xl/comments1.xml'; '/xl/x.xml' -> 'xl/x.xml'
const resolvePath = (baseDir, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const out = baseDir.split('/').filter(Boolean);
  for (const part of target.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
};
const relsOf = (xml) =>
  [...(xml || '').matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({
    id: attr(m[0], 'Id'), type: attr(m[0], 'Type') || '', target: attr(m[0], 'Target') || '',
  }));
const formulaXml = (cell) => cell.inner.match(/<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/)?.[0] ?? '';

const hashHex = async (text) => {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fall through */ }
  let h = 0x811c9dc5; // FNV-1a fallback (non-secure contexts)
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `fnv-${h.toString(16).padStart(8, '0')}`;
};

// getter that computes once, stays out of JSON / spreads
const lazy = (obj, key, fn) => {
  let done = false;
  let val;
  Object.defineProperty(obj, key, {
    enumerable: false, configurable: true,
    get() { if (!done) { val = fn(); done = true; } return val; },
  });
};

export const emptyInspection = () => ({
  sheets: [], missingSheets: [], pivots: { tables: [], caches: [] },
  headerCells: { byPlantUpdate: null, byPlantMonth: null, analyzeMonths: [] },
  templateMonth: null, nCols: null, analyze: null, generator: { application: null, version: null },
  kind: null, vba: false, externalLinks: [], fingerprint: null, issues: [], deep: false,
});

const issue = (level, code, sheet, message, fix) => ({ level, code, sheet: sheet ?? null, message, fix });

// ---------- per-sheet analysis ----------
const sheetFlags = (xml) => ({
  conditionalFormatting: /<conditionalFormatting\b/.test(xml),
  mergeCells: /<mergeCells\b/.test(xml),
  sheetProtection: /<sheetProtection\b/.test(xml),
  dataValidations: /<dataValidations\b/.test(xml),
});
const conditionalRanges = (xml) =>
  [...xml.matchAll(/<conditionalFormatting\b[^>]*\bsqref="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean));

const analyzeDaily = (entry, xml, sst) => {
  const parsed = parseSheet(xml);
  let headerRow = findRowWithText(parsed.rows, sst, 1, 'PART NUMBER');
  const headerFound = headerRow !== null;
  headerRow ??= TEMPLATE.dailyHeaderRow;
  const dataStartRow = headerRow + 1;
  const header = parsed.rows.get(headerRow);
  const cols = N_LABELS.map((t) => lastColWithText(header, sst, t));
  const nCols = cols.every(Boolean) ? cols : null;
  const lastCol = nCols ? nCols[3] : TEMPLATE.maxSourceCols;
  const formulaCols = new Set([1, 2, 3, 4, 5, 6, 7, 8, ...(nCols ?? [])]);
  let first = null;
  for (const row of [...parsed.rows.values()].sort((a, b) => a.r - b.r)) {
    if (row.r < dataStartRow) continue;
    if ([...row.cells.values()].some((c) => c.hasFormula && formulaCols.has(c.col))) { first = row.r; break; }
  }
  Object.assign(entry, {
    headerRow, dataStartRow, headerFound, nCols, lastCol,
    firstFormulaRowBelowData: first,
    capacity: first === null ? null : Math.max(0, first - dataStartRow),
    capacitySource: first === null ? null : 'formula',
  });
  return { parsed, header, zone: { min: 1, max: lastCol } };
};

const analyzeAnalyzeSheet = (entry, xml, sst) => {
  const parsed = parseSheet(xml);
  const offset = TEMPLATE.analyzeSourceOffset;
  let headerRow = findRowWithText(parsed.rows, sst, offset, 'PART NUMBER');
  const headerFound = headerRow !== null;
  headerRow ??= TEMPLATE.analyzeHeaderRow;
  const dataStartRow = headerRow + 1;
  const header = parsed.rows.get(headerRow);
  const n3 = lastColWithText(header, sst, 'N+3');
  const plantCol = n3 ? n3 + 1 : TEMPLATE.analyzePlantCol;
  const af = entry.autoFilter ? parseRange(entry.autoFilter) : null;
  const capacity = af ? Math.max(0, af.r2 - dataStartRow + 1) : null;
  Object.assign(entry, {
    headerRow, dataStartRow, headerFound, nCols: null, lastCol: plantCol,
    firstFormulaRowBelowData: null, capacity, capacitySource: af ? 'autoFilter' : null,
  });
  return { parsed, header, zone: { min: offset, max: plantCol }, plantCol };
};

// ---------- pivots ----------
const readPivots = async (zip, sheets) => {
  const pivots = { tables: [], caches: [] };
  const wb = await readText(zip, 'xl/workbook.xml');
  const wbRels = relsOf(await readText(zip, 'xl/_rels/workbook.xml.rels'));
  const nameOf = new Map(sheets.map((s) => [s.path, s.name]));

  for (const m of (wb || '').matchAll(/<pivotCache\b[^>]*>/g)) {
    const cacheId = attr(m[0], 'cacheId');
    const rel = wbRels.find((r) => r.id === attr(m[0], 'r:id'));
    const xml = rel ? await readText(zip, resolvePath('xl', rel.target)) : null;
    const src = xml?.match(/<worksheetSource\b[^>]*>/)?.[0];
    pivots.caches.push({
      cacheId: cacheId === undefined ? null : Number(cacheId),
      sheet: src ? decodeXml(attr(src, 'sheet') ?? '') || null : null,
      ref: src ? decodeXml(attr(src, 'ref') ?? attr(src, 'name') ?? '') || null : null,
      refreshOnLoad: /\brefreshOnLoad="(1|true)"/.test(xml?.match(/<pivotCacheDefinition\b[^>]*>/)?.[0] ?? ''),
      refreshedDate: xml ? Number(attr(xml.match(/<pivotCacheDefinition\b[^>]*>/)?.[0] ?? '', 'refreshedDate')) || null : null,
    });
  }

  await Promise.all(sheets.map(async (s) => {
    if (!s.path) return;
    const dir = s.path.slice(0, s.path.lastIndexOf('/'));
    const relPath = `${dir}/_rels/${s.path.slice(s.path.lastIndexOf('/') + 1)}.rels`;
    const rels = relsOf(await readText(zip, relPath));
    for (const r of rels.filter((x) => /\/pivotTable$/.test(x.type))) {
      const xml = await readText(zip, resolvePath(dir, r.target));
      if (!xml) continue;
      const head = xml.match(/<pivotTableDefinition\b[^>]*>/)?.[0] ?? '';
      pivots.tables.push({
        name: decodeXml(attr(head, 'name') ?? ''), sheet: nameOf.get(s.path) ?? s.name,
        cacheId: Number(attr(head, 'cacheId')), ref: attr(xml.match(/<location\b[^>]*>/)?.[0] ?? '', 'ref') ?? null,
      });
    }
  }));
  pivots.tables.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.name.localeCompare(b.name));
  return pivots;
};

// ---------- comments ----------
const readComments = async (zip, sheets) => {
  const out = [];
  for (const s of sheets) {
    if (!s.path) continue;
    const dir = s.path.slice(0, s.path.lastIndexOf('/'));
    const relPath = `${dir}/_rels/${s.path.slice(s.path.lastIndexOf('/') + 1)}.rels`;
    const rel = relsOf(await readText(zip, relPath)).find((r) => /\/comments$/.test(r.type));
    const xml = rel ? await readText(zip, resolvePath(dir, rel.target)) : null;
    if (!xml) continue;
    const authors = [...xml.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((m) => decodeXml(m[1]));
    for (const m of xml.matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
      const ref = attr(m[1], 'ref');
      const author = authors[Number(attr(m[1], 'authorId'))] ?? '';
      let text = [...m[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join('');
      if (author && text.startsWith(`${author}:`)) text = text.slice(author.length + 1);
      out.push({ sheet: s.name, ref, author, text: text.replace(/\r/g, '').trim() });
    }
  }
  return out;
};

// ---------- main ----------
/**
 * @param {ArrayBuffer|Uint8Array} buffer template .xlsx
 * @param {{ deep?: boolean }} opts deep: also expose `masters` and `comments` (memoised getters, not enumerable)
 */
export const inspectTemplate = async (buffer, { deep = false } = {}) => {
  const out = emptyInspection();
  out.deep = !!deep;
  try {
    const { loadZip } = await import('../../lib/excel/zipLoad.js'); // lazy: jszip stays inside lib/excel
    const zip = await loadZip(buffer);
    return await inspectZip(zip, out, deep);
  } catch (err) {
    out.issues.push(issue('error', 'INSPECT_FAILED', null, `ตรวจเทมเพลตไม่ได้: ${err?.message || err}`, 'ตรวจสอบว่าเป็นไฟล์ .xlsx ที่เปิดใน Excel ได้ แล้วอัปโหลดใหม่ (ยังประมวลผลและดาวน์โหลดได้ตามปกติ)'));
    return out;
  }
};

const inspectZip = async (zip, out, deep) => {
  const names = Object.keys(zip.files);
  const contentTypes = (await readText(zip, '[Content_Types].xml')) || '';
  const macro = /macroEnabled/i.test(contentTypes);
  out.kind = zip.file('xl/workbook.bin') ? 'xlsb' : macro ? 'xlsm' : 'xlsx';
  out.vba = macro || names.includes('xl/vbaProject.bin');
  out.externalLinks = names.filter((n) => /^xl\/externalLinks\/externalLink\d+\.xml$/.test(n));

  const app = (await readText(zip, 'docProps/app.xml')) || '';
  out.generator = {
    application: decodeXml(app.match(/<Application>([\s\S]*?)<\/Application>/)?.[1] ?? '') || null,
    version: app.match(/<AppVersion>([\s\S]*?)<\/AppVersion>/)?.[1] ?? null,
  };

  if (out.kind === 'xlsb') {
    out.issues.push(issue('error', 'KIND_UNSUPPORTED', null, 'ไฟล์เป็นรูปแบบ .xlsb ซึ่งระบบเขียนลงเทมเพลตโดยตรงไม่ได้', 'เปิดใน Excel แล้ว Save As เป็น .xlsx (Excel Workbook) ก่อนอัปโหลด'));
    return out;
  }
  if (out.kind === 'xlsm') {
    out.issues.push(issue('warning', 'KIND_UNSUPPORTED', null, 'ไฟล์เป็น .xlsm (มี macro/VBA) ระบบจะไม่เก็บ macro ในไฟล์ที่ส่งออก', 'ถ้าต้องใช้ macro ให้เปิดไฟล์ที่ส่งออกแล้วคัดลอกกลับ หรือ Save As .xlsx แล้วอัปโหลดใหม่'));
  }
  if (out.generator.application && !/excel/i.test(out.generator.application)) {
    out.issues.push(issue('warning', 'GENERATOR_NOT_EXCEL', null, `ไฟล์นี้บันทึกโดย ${out.generator.application} ไม่ใช่ Microsoft Excel`, 'เปิดไฟล์ที่ส่งออกใน Excel แล้วกด Data > Refresh All (pivot ที่สร้างด้วยโปรแกรมอื่นอาจไม่อัปเดตเอง) จากนั้นบันทึก'));
  }

  const sheets = await listSheets(zip);
  const sst = await loadSharedStrings(zip);
  const xmls = await Promise.all(sheets.map((s) => (s.path ? readText(zip, s.path) : null)));

  const parts = {}; // name -> { parsed, header, zone, plantCol }
  sheets.forEach((s, i) => {
    const xml = xmls[i] || '';
    const role = DAILY_SHEETS.includes(s.name) ? 'daily' : s.name === ANALYZE_SHEET ? 'analyze' : 'other';
    const af = xml.match(/<autoFilter\b[^>]*\bref="([^"]+)"/)?.[1] ?? null;
    const entry = {
      name: s.name, path: s.path ?? null, index: s.index, hidden: !!s.hidden, role,
      headerRow: null, dataStartRow: null, capacity: null, capacitySource: null, firstFormulaRowBelowData: null,
      autoFilter: af, dimension: xml.match(/<dimension\b[^>]*\bref="([^"]+)"/)?.[1] ?? null,
      flags: sheetFlags(xml), conditionalRanges: conditionalRanges(xml),
    };
    if (xml && role === 'daily') parts[s.name] = analyzeDaily(entry, xml, sst);
    else if (xml && role === 'analyze') parts[s.name] = analyzeAnalyzeSheet(entry, xml, sst);
    out.sheets.push(entry);
  });
  const byName = Object.fromEntries(out.sheets.map((s) => [s.name, s]));

  // ---- structural facts -> issues ----
  out.missingSheets = REQUIRED_SHEETS.filter((n) => !byName[n]);
  for (const n of out.missingSheets) {
    out.issues.push(issue('error', 'SHEET_MISSING', n, `ไม่พบ sheet "${n}" ในเทมเพลต`, `เพิ่ม sheet ชื่อ "${n}" ให้ตรงตัวอักษร (เว้นวรรค/ตัวพิมพ์) หรือใช้เทมเพลตล่าสุดของบริษัท`));
  }
  for (const e of out.sheets.filter((s) => s.role !== 'other')) {
    if (e.headerFound === false) {
      out.issues.push(issue('warning', 'HEADER_NOT_FOUND', e.name, `${e.name}: ไม่พบแถวหัวตาราง "PART NUMBER" ใช้ตำแหน่งมาตรฐานแถว ${e.headerRow} แทน`, 'ตรวจว่าหัวตารางอยู่ตำแหน่งเดิมของเทมเพลต (Daily แถว 13 / Analyze แถว 2)'));
    }
    const af = e.autoFilter ? parseRange(e.autoFilter) : null;
    if (!e.autoFilter) {
      out.issues.push(issue('warning', 'NO_AUTOFILTER', e.name, `${e.name}: ไม่มี AutoFilter ที่หัวตาราง ระบบไม่มีกรอบให้ขยายตามจำนวนแถวใหม่`, 'เปิดเทมเพลตใน Excel เลือกแถวหัวตาราง แล้วกด Data > Filter ก่อนบันทึก'));
    } else if (af && e.headerRow && af.r2 <= e.headerRow) {
      out.issues.push(issue('warning', 'AUTOFILTER_HEADER_ONLY', e.name, `${e.name}: AutoFilter ครอบแค่แถวหัวตาราง (${e.autoFilter}) ไม่รวมแถวข้อมูล`, 'เปิดเทมเพลตใน Excel ลบ Filter แล้วเลือกตารางทั้งช่วง (หัวตาราง + แถวข้อมูล) กด Data > Filter ใหม่'));
    }
    if (e.role === 'daily' && e.capacity !== null) {
      const lastRow = e.dataStartRow + e.capacity - 1;
      const hits = e.conditionalRanges.filter((ref) => {
        const r = parseRange(ref);
        return r && r.r2 >= e.dataStartRow && r.r1 <= lastRow;
      });
      if (hits.length) {
        out.issues.push(issue('info', 'COND_FORMAT_IN_RANGE', e.name, `${e.name}: มี Conditional Formatting ทับพื้นที่ข้อมูล (${hits.join(', ')}) สีอาจเปลี่ยนเมื่อวางข้อมูลใหม่`, 'ตรวจสีหลังส่งออก หรือเปิด Home > Conditional Formatting > Manage Rules แล้วจำกัดช่วงให้เหมาะสม'));
      }
    }
  }

  // ---- pivots ----
  out.pivots = await readPivots(zip, sheets);
  if (!out.pivots.tables.length) {
    out.issues.push(issue('warning', 'NO_PIVOT', null, 'ไม่พบ Pivot Table ในเทมเพลต ตาราง Summary/By Plant จะไม่อัปเดตจากข้อมูลใหม่', 'ใช้เทมเพลตที่มี Pivot Table ของบริษัท หรือสร้าง Pivot จากข้อมูล Analyze ใหม่'));
  }

  // ---- header cells / month ----
  const bp = byName[BY_PLANT] && xmls[byName[BY_PLANT].index] ? parseSheet(xmls[byName[BY_PLANT].index]) : null;
  if (bp) {
    const monthRow = findRowWithText(bp.rows, sst, 1, 'PRODUCTION MONTH', 10) ?? 3;
    const textAt = (r, c) => { const t = cellText(bp.rows.get(r)?.cells.get(c), sst); return t === '' ? null : t; };
    out.headerCells.byPlantUpdate = { ref: 'C2', text: textAt(2, 3) };
    out.headerCells.byPlantMonth = { ref: `C${monthRow}`, text: textAt(monthRow, 3) };
    out.templateMonth = out.headerCells.byPlantMonth.text;
  }
  const an = parts[ANALYZE_SHEET];
  if (an) {
    const row1 = an.parsed.rows.get(1);
    out.headerCells.analyzeMonths = [...(row1?.cells.values() ?? [])]
      .filter((c) => c.col >= getColumnIndex('AO') && c.col <= getColumnIndex('EG'))
      .map((c) => ({ ref: `${getColumnLetter(c.col)}1`, text: cellText(c, sst) }))
      .filter((c) => c.text !== '');
    const e = byName[ANALYZE_SHEET];
    out.analyze = { plantCol: an.plantCol, plantColLetter: getColumnLetter(an.plantCol), headerRow: e.headerRow, dataStartRow: e.dataStartRow, capacity: e.capacity };
  }
  out.nCols = out.sheets.find((s) => s.role === 'daily' && s.nCols)?.nCols ?? null;

  // ---- fingerprint: sheet names + header rows + formulas inside the written range ----
  const fp = { sheets: sheets.map((s) => s.name), parts: [] };
  for (const name of [...DAILY_SHEETS, ANALYZE_SHEET]) {
    const p = parts[name];
    const e = byName[name];
    if (!p) continue;
    const upto = e.role === 'daily' ? e.lastCol : e.lastCol;
    const header = [];
    for (let c = 1; c <= upto; c++) header.push(cellText(p.header?.cells.get(c), sst));
    const formulas = [];
    for (const row of [...p.parsed.rows.values()].sort((a, b) => a.r - b.r)) {
      if (row.r < e.dataStartRow) continue;
      for (const cell of row.cells.values()) {
        if (cell.hasFormula && (e.role === 'analyze' || cell.col <= upto)) formulas.push(`${getColumnLetter(cell.col)}${row.r}${formulaXml(cell)}`);
      }
    }
    fp.parts.push({ name, headerRow: e.headerRow, header, formulas });
  }
  out.fingerprint = await hashHex(JSON.stringify(fp));

  // ---- deep: masters + comments (computed lazily, once) ----
  if (deep) {
    const total = byName[TOTAL] && xmls[byName[TOTAL].index] ? parseSheet(xmls[byName[TOTAL].index]) : null;
    const rawComments = await readComments(zip, sheets);
    lazy(out, 'masters', () => {
      const masters = { byPlantKeys: [], totalParts: [], dockSuffixMap: [], pivotSources: out.pivots.caches.filter((c) => c.sheet).map((c) => `${c.sheet}!${c.ref}`) };
      if (bp) {
        const header = findRowWithText(bp.rows, sst, 1, 'PART NO.', 30) ?? 6;
        for (let r = header + 1; r <= bp.lastRow; r++) {
          const row = bp.rows.get(r);
          const part = norm(cellText(row?.cells.get(1), sst));
          const plant = norm(cellText(row?.cells.get(4), sst));
          if (!part || !plant) break;
          const pn = norm(cellText(row.cells.get(2), sst)) || part.replace(/\s/g, '').slice(0, 11);
          masters.byPlantKeys.push(`${pn}${plant}`);
        }
      }
      if (total) {
        const header = findRowWithText(total.rows, sst, 1, 'PART', 30) ?? 4;
        for (let r = header + 1; r <= total.lastRow; r++) {
          const part = norm(cellText(total.rows.get(r)?.cells.get(1), sst));
          if (!part) break;
          masters.totalParts.push(part);
        }
      }
      if (an) {
        const start = byName[ANALYZE_SHEET].dataStartRow;
        let started = false;
        for (let r = start; r <= an.parsed.lastRow; r++) {
          const cells = an.parsed.rows.get(r)?.cells;
          const part = norm(cellText(cells?.get(DOCK_COLS.part), sst));
          if (!part) { if (started) break; continue; }
          started = true;
          const plant = norm(cellText(cells.get(DOCK_COLS.plant), sst));
          const dock = norm(cellText(cells.get(DOCK_COLS.dock), sst));
          masters.dockSuffixMap.push({
            row: r, part, plant, dock, key: `${part.slice(0, 11)}${plant}${dock}`, packing: norm(cellText(cells.get(DOCK_COLS.packing), sst)),
          });
        }
      }
      return masters;
    });
    lazy(out, 'comments', () => rawComments.map((c) => {
      const e = byName[c.sheet];
      const p = parseRef(c.ref);
      let inside = false;
      if (e && p && e.dataStartRow && (e.role === 'daily' || e.role === 'analyze')) {
        const last = e.capacity === null ? Infinity : e.dataStartRow + e.capacity - 1;
        const [c1, c2] = e.role === 'daily' ? [1, e.lastCol] : [TEMPLATE.analyzeSourceOffset, e.lastCol];
        inside = p.row >= e.dataStartRow && p.row <= last && p.col >= c1 && p.col <= c2;
      }
      return { ...c, insidePatchedArea: inside };
    }));
  }
  return out;
};
