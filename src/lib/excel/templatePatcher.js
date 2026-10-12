// ==================== TEMPLATE PATCHER ====================
// Writes consolidated rows into the customer's template .xlsx by editing only
// the worksheet XML of the sheets we own ("<Plant> Daily" + "Analyze").
//
// Why not ExcelJS?  Re-serialising the whole workbook through ExcelJS silently
// drops pivot tables / pivot caches / comments and rewrites every style.  The
// template relies on pivot tables ("Summary", "By Plant", "Analyze"), so we
// patch the zip in place instead: everything we do not touch survives 1:1.
//
// Rules:
//   - cells that contain a formula are never overwritten or cleared
//   - a written cell keeps the style of the cell it replaces (or of the first
//     data row in the template) and gets a light-blue fill + blue border
//   - rows below the data are cleared (values only, styles kept)
//   - dimension / autoFilter / _FilterDatabase / pivot source ranges are
//     extended so they cover the new rows
//   - fullCalcOnLoad + refreshOnLoad are set so Excel recalculates formulas
//     and refreshes every pivot table on open
import JSZip from 'jszip';
import { getColumnIndex, getColumnLetter, safeSheetName } from '../../utils/format.js';
import { ANALYZE_SHEET, TEMPLATE } from '../../constants.js';
import { resolveSheetName, spillSheetName } from './sheetNames.js';

// ---------- XML helpers ----------
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeXml = (s) =>
  String(s)
    .replace(/[&<>"]/g, (c) => ESCAPES[c])
    // control characters are not allowed in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const decodeXml = (s) =>
  String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
// String.replace() with a function so "$&"-style patterns in formulas are not interpreted
const spliceAt = (xml, match, replacement) =>
  xml.slice(0, match.index) + replacement + xml.slice(match.index + match[0].length);

const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

// ---------- workbook parts ----------
export const readText = async (zip, path) => {
  const f = zip.file(path);
  return f ? f.async('string') : null;
};
// write without adding synthetic folder entries to the archive
const writeText = (zip, path, content) => zip.file(path, content, { createFolders: false });

const resolveTarget = (target) => (target.startsWith('/') ? target.slice(1) : `xl/${target}`);

// [{ name, rId, path, index }] in workbook order
export const listSheets = async (zip) => {
  const wb = await readText(zip, 'xl/workbook.xml');
  const rels = await readText(zip, 'xl/_rels/workbook.xml.rels');
  if (!wb || !rels) throw new Error('ไม่พบ xl/workbook.xml (ไฟล์หลักต้องเป็น .xlsx)');
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) relMap[id] = resolveTarget(target);
  }
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m, index) => {
    const rId = attr(m[0], 'r:id');
    return { name: decodeXml(attr(m[0], 'name') ?? ''), rId, path: relMap[rId], index, hidden: /state="hidden"/.test(m[0]) };
  });
};

// ArrayBuffer -> sheet names (cheap: only workbook.xml is parsed)
export const listSheetNames = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  return (await listSheets(zip)).map((s) => s.name);
};

export const loadSharedStrings = async (zip) => {
  const xml = await readText(zip, 'xl/sharedStrings.xml');
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(''),
  );
};

// ---------- sheet parsing ----------
const parseCell = (match) => {
  const attrs = match[1] || '';
  const inner = match[2] || '';
  const ref = attr(attrs, 'r');
  if (!ref) return null;
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return {
    col: getColumnIndex(m[1]),
    xml: match[0],
    inner,
    s: attr(attrs, 's'),
    t: attr(attrs, 't'),
    hasFormula: /<f\b/.test(inner),
  };
};

const parseRow = (match) => {
  const attrs = match[1] || '';
  const inner = match[2] || '';
  const cells = new Map();
  for (const c of inner.matchAll(CELL_RE)) {
    const cell = parseCell(c);
    if (cell) cells.set(cell.col, cell);
  }
  return { r: Number(attr(attrs, 'r')), attrs, cells, xml: match[0] };
};

export const parseSheet = (xml) => {
  const sheetData = xml.match(/<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/);
  if (!sheetData) throw new Error('ไม่พบ <sheetData>');
  const rows = new Map();
  for (const m of (sheetData[1] || '').matchAll(ROW_RE)) {
    const row = parseRow(m);
    if (Number.isFinite(row.r)) rows.set(row.r, row);
  }
  return { sheetData, rows, lastRow: Math.max(0, ...rows.keys()) };
};

export const cellText = (cell, sst) => {
  if (!cell) return '';
  if (cell.t === 'inlineStr') {
    return [...cell.inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
  }
  const v = cell.inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (v === undefined) return '';
  return cell.t === 's' ? sst[Number(v)] ?? '' : decodeXml(v);
};

const norm = (s) => String(s ?? '').trim().toUpperCase();

// First row (1-based) whose cell in `col` reads `text`.
export const findRowWithText = (rows, sst, col, text, limit = 80) => {
  for (const row of [...rows.values()].sort((a, b) => a.r - b.r)) {
    if (row.r > limit) break;
    if (norm(cellText(row.cells.get(col), sst)) === text) return row.r;
  }
  return null;
};

// Right-most column in a row whose cell reads `text`.
export const lastColWithText = (row, sst, text) => {
  let found = null;
  if (!row) return null;
  for (const [col, cell] of row.cells) {
    if (norm(cellText(cell, sst)) === text && (found === null || col > found)) found = col;
  }
  return found;
};

// ---------- cell building ----------
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
export const toSerial = (d) => (d.getTime() - EXCEL_EPOCH) / 86400000;
// typed value: { v, t: 'date' | 'int' | 'num' | 'text' | 'bool' }
export const isTyped = (x) => x !== null && typeof x === 'object' && !(x instanceof Date) && 't' in x && 'v' in x;
const TYPED_NUMFMT = { date: 15, int: 1, num: 3 };

// typed -> plain JS value (number | string | boolean | null)
const plainValue = (x) => {
  if (!isTyped(x)) return x;
  const { v, t } = x;
  if (v === null || v === undefined || v === '') return null;
  if (t === 'date') {
    if (typeof v === 'number') return v;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isFinite(d.getTime()) ? toSerial(d) : String(v);
  }
  if (t === 'int' || t === 'num') {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : String(v);
  }
  if (t === 'bool') return Boolean(v);
  return String(v);
};

export const buildCell = (col, row, input, s) => {
  const ref = `${getColumnLetter(col)}${row}`;
  const sAttr = s !== undefined && s !== null && s !== '' ? ` s="${s}"` : '';
  const value = plainValue(input);
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${sAttr}/>`;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${sAttr}><v>${value}</v></c>` : `<c r="${ref}"${sAttr}/>`;
  }
  if (typeof value === 'boolean') return `<c r="${ref}"${sAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
  if (value instanceof Date) {
    return `<c r="${ref}"${sAttr}><v>${toSerial(value)}</v></c>`;
  }
  const text = String(value);
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t${space}>${escapeXml(text)}</t></is></c>`;
};

// number format a typed/Date value wants, or null
const numFmtFor = (value) => (value instanceof Date ? 15 : isTyped(value) ? TYPED_NUMFMT[value.t] ?? null : null);

const setXfAttr = (xml, name, val) =>
  new RegExp(`\\b${name}=`).test(xml)
    ? xml.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${val}"`)
    : xml.replace(/^<xf\b/, `<xf ${name}="${val}"`);

// ---------- styles.xml: derived "highlighted" cell formats ----------
export class StyleRegistry {
  constructor(xml, { fill = 'FFE6F7FF', border = 'FF1E40AF' } = {}) {
    this.xml = xml;
    this.fillRgb = fill;
    this.borderRgb = border;
    this.map = new Map();
    this.fillId = null;
    this.borderId = null;
    this.xfs = null;
    this.newXfs = [];
  }

  ensureXfs() {
    if (this.xfs) return;
    if (!this.xml) throw new Error('ไม่พบ xl/styles.xml');
    const xfs = this.xml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
    if (!xfs) throw new Error('styles.xml: ไม่พบ <cellXfs>');
    this.xfs = [...xfs[2].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  }

  // index of a cellXf identical to `base` but with a built-in number format (1, 3 or 15 only)
  withNumFmt(base, numFmtId) {
    if (![1, 3, 15].includes(numFmtId)) throw new Error(`numFmtId ${numFmtId} ไม่รองรับ`);
    this.ensureXfs();
    const b = Number(base) || 0;
    const all = [...this.xfs, ...this.newXfs];
    const key = `${b}:${numFmtId}`;
    this.fmtMap = this.fmtMap || new Map();
    if (this.fmtMap.has(key)) return this.fmtMap.get(key);
    let xf = all[b] || all[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    if (Number(attr(xf, 'numFmtId')) === numFmtId) { this.fmtMap.set(key, b); return b; }
    xf = setXfAttr(xf, 'numFmtId', numFmtId);
    xf = setXfAttr(xf, 'applyNumberFormat', 1);
    const idx = all.length;
    this.newXfs.push(xf);
    this.fmtMap.set(key, idx);
    return idx;
  }

  ensureBase() {
    if (this.fillId !== null) return;
    if (!this.xml) throw new Error('ไม่พบ xl/styles.xml');
    const fills = this.xml.match(/<fills count="(\d+)">([\s\S]*?)<\/fills>/);
    const borders = this.xml.match(/<borders count="(\d+)">([\s\S]*?)<\/borders>/);
    if (!fills || !borders) throw new Error('styles.xml: ไม่พบ <fills>/<borders>');
    this.fillId = Number(fills[1]);
    this.xml = spliceAt(this.xml, fills,
      `<fills count="${this.fillId + 1}">${fills[2]}<fill><patternFill patternType="solid"><fgColor rgb="${this.fillRgb}"/><bgColor indexed="64"/></patternFill></fill></fills>`);
    // re-match because indexes shifted
    const borders2 = this.xml.match(/<borders count="(\d+)">([\s\S]*?)<\/borders>/);
    this.borderId = Number(borders2[1]);
    const side = (name) => `<${name} style="thin"><color rgb="${this.borderRgb}"/></${name}>`;
    this.xml = spliceAt(this.xml, borders2,
      `<borders count="${this.borderId + 1}">${borders2[2]}<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border></borders>`);
    this.ensureXfs();
  }

  // index of a cellXf identical to `base` but with the highlight fill + border
  highlighted(base) {
    this.ensureBase();
    const b = Number(base) || 0;
    if (this.map.has(b)) return this.map.get(b);
    const setAttr = setXfAttr;
    const all = [...this.xfs, ...this.newXfs];
    let xf = all[b] || all[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    xf = setAttr(xf, 'fillId', this.fillId);
    xf = setAttr(xf, 'borderId', this.borderId);
    xf = setAttr(xf, 'applyFill', 1);
    xf = setAttr(xf, 'applyBorder', 1);
    const idx = all.length;
    this.newXfs.push(xf);
    this.map.set(b, idx);
    return idx;
  }

  // returns the new styles.xml, or null when nothing changed
  commit() {
    if (!this.newXfs.length) return null;
    const xfs = this.xml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
    return spliceAt(this.xml, xfs,
      `<cellXfs count="${this.xfs.length + this.newXfs.length}">${xfs[2]}${this.newXfs.join('')}</cellXfs>`);
  }
}

// ---------- the per-sheet patch ----------
const colRange = (cols) => (cols.length ? `${getColumnLetter(Math.min(...cols))}:${getColumnLetter(Math.max(...cols))}` : null);

const assembleRow = (attrsIn, r, cells) => {
  const cols = [...cells.keys()].sort((a, b) => a - b);
  let attrs = /\br="\d+"/.test(attrsIn) ? attrsIn.replace(/\br="\d+"/, `r="${r}"`) : ` r="${r}"${attrsIn}`;
  if (cols.length && /\bspans="[^"]*"/.test(attrs)) {
    attrs = attrs.replace(/\bspans="[^"]*"/, `spans="${cols[0]}:${cols[cols.length - 1]}"`);
  }
  return {
    attrs,
    xml: cols.length ? `<row${attrs}>${cols.map((c) => cells.get(c)).join('')}</row>` : `<row${attrs}/>`,
  };
};

// children of <worksheet> that may follow <sheetData> after <autoFilter> in CT_Worksheet order
const AFTER_AUTOFILTER = [
  'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting',
  'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks',
  'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing',
  'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
];
export const insertAutoFilter = (xml, ref) => {
  const end = xml.indexOf('</sheetData>');
  const from = end === -1 ? xml.search(/<sheetData\b[^>]*\/>/) : end;
  if (from === -1) return xml;
  const tail = xml.slice(from);
  let pos = tail.indexOf('</worksheet>');
  for (const tag of AFTER_AUTOFILTER) {
    const m = tail.match(new RegExp(`<${tag}[\\s>/]`));
    if (m && m.index < pos) pos = m.index;
  }
  if (pos < 0) return xml;
  const at = from + pos;
  // a self-closing <sheetData/> ends before `from + its length`
  const selfClose = end === -1 ? xml.match(/<sheetData\b[^>]*\/>/) : null;
  const insertAt = selfClose ? Math.max(at, selfClose.index + selfClose[0].length) : at;
  return `${xml.slice(0, insertAt)}<autoFilter ref="${ref}"/>${xml.slice(insertAt)}`;
};

/**
 * @param {string} xml            worksheet xml
 * @param {object} parsed         result of parseSheet(xml)
 * @param {object} opts
 * @param {number} opts.startRow  first data row (1-based)
 * @param {Map<number, any>[]} opts.dataRows  one Map(col -> value) per output row
 * @param {number} opts.clearThroughRow  rows startRow..clearThroughRow lose their values
 * @param {StyleRegistry} opts.styles
 * @param {boolean} opts.highlight
 * @param {{min?:number,max?:number}} [opts.zone]  writable columns; cells outside are never touched. Giving a zone turns the formula-row guard on
 * @param {number} [opts.capRow]  extra upper bound for data rows (e.g. an autoFilter end)
 * @param {number} [opts.clearMax]  last column that may be cleared (default: zone.max; Infinity restores the old behaviour)
 * @param {{headerRow:number,lastCol:number}} [opts.autoFilter]  insert an <autoFilter> when the sheet has none
 * @returns formulas inside the zone stop the table: rows at/below the first formula row are never
 *   written or cleared; rows that do not fit come back as `blocked` ([] or one entry) with `dropped` indexes.
 */
export const patchSheetXml = (xml, parsed, { startRow, dataRows, clearThroughRow, styles, highlight, zone, clearMax, capRow, autoFilter }) => {
  const { sheetData, rows } = parsed;
  const guarded = Boolean(zone); // the formula-row guard is on whenever the caller names a writable zone
  const zMin = zone?.min ?? 1;
  const zMax = zone?.max ?? Infinity;
  const cMax = clearMax ?? zMax;
  const inZone = (col) => col >= zMin && col <= zMax;
  const inClear = (col) => col >= zMin && col <= cMax;

  // first row (>= startRow) with a formula inside the writable zone
  let firstFormulaRow = null;
  for (const row of guarded ? [...rows.values()].sort((a, b) => a.r - b.r) : []) {
    if (row.r < startRow) continue;
    if ([...row.cells.values()].some((c) => c.hasFormula && inZone(c.col))) { firstFormulaRow = row.r; break; }
  }
  let limitRow = Infinity;
  if (firstFormulaRow !== null) limitRow = firstFormulaRow - 1;
  if (capRow !== undefined && capRow !== null) limitRow = Math.min(limitRow, capRow);
  const capacity = Number.isFinite(limitRow) ? Math.max(0, limitRow - startRow + 1) : Infinity;
  const kept = dataRows.slice(0, capacity);
  const droppedIdx = kept.length < dataRows.length ? dataRows.slice(kept.length).map((_, i) => kept.length + i) : [];
  const blocked = droppedIdx.length ? [{ atRow: firstFormulaRow ?? limitRow + 1, dropped: droppedIdx.length, indexes: droppedIdx }] : [];

  const templateRow = rows.get(startRow);
  const lastDataRow = startRow + kept.length - 1;
  const endClear = Math.min(Math.max(clearThroughRow ?? 0, lastDataRow), limitRow);
  let maxCol = 0;
  let written = 0;
  const preserved = { cols: new Set(), valueRefs: [] };

  for (let r = startRow; r <= endClear; r++) {
    const existing = rows.get(r);
    const data = kept[r - startRow];
    if (!existing && !data) continue;

    const cells = new Map();
    if (existing) {
      for (const [col, cell] of existing.cells) {
        if (!inClear(col)) {
          cells.set(col, cell.xml); // side columns survive
          continue;
        }
        // formulas are sacred; everything else is cleared (style kept)
        cells.set(col, cell.hasFormula ? cell.xml : buildCell(col, r, null, cell.s));
      }
    }
    if (data) {
      for (const [col, value] of data) {
        if (!inZone(col)) continue;
        const ex = existing?.cells.get(col);
        if (ex?.hasFormula) continue;
        if (value === null || value === undefined || value === '') continue;
        let s = ex?.s ?? templateRow?.cells.get(col)?.s;
        const fmt = numFmtFor(value);
        if (fmt && styles) s = styles.withNumFmt(s, fmt);
        if (highlight && styles) s = styles.highlighted(s);
        cells.set(col, buildCell(col, r, value, s));
        if (col > maxCol) maxCol = col;
        written++;
      }
    }

    const row = assembleRow(existing?.attrs ?? templateRow?.attrs ?? '', r, cells);
    rows.set(r, { r, attrs: row.attrs, cells: existing?.cells ?? new Map(), xml: row.xml });
  }

  // side columns (right of the table) that carry content from the data start down
  for (const row of [...rows.values()].sort((a, b) => a.r - b.r)) {
    if (row.r < startRow) continue;
    for (const [col, cell] of row.cells) {
      if (inClear(col) || !/<f\b|<v>|<is>/.test(cell.inner || '')) continue;
      preserved.cols.add(col);
      if (!cell.hasFormula) preserved.valueRefs.push(`${getColumnLetter(col)}${row.r}`);
    }
  }

  const body = [...rows.values()].sort((a, b) => a.r - b.r).map((row) => row.xml).join('');
  let out = spliceAt(xml, sheetData, `<sheetData>${body}</sheetData>`);

  // <dimension ref="A1:EL26"/>
  const dim = out.match(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/);
  if (dim) {
    const endRow = Math.max(Number(dim[4]), lastDataRow, 1);
    const endCol = Math.max(getColumnIndex(dim[3]), maxCol, 1);
    out = spliceAt(out, dim, `<dimension ref="${dim[1]}${dim[2]}:${getColumnLetter(endCol)}${endRow}"/>`);
  }
  // <autoFilter ref="A13:EF21" .../>
  let filter = null;
  let filterRef = null;
  const af = out.match(/<autoFilter ref="([A-Z]+\d+):([A-Z]+)(\d+)"/);
  if (af) {
    if (lastDataRow >= startRow) {
      const end = Math.max(Number(af[3]), lastDataRow);
      out = spliceAt(out, af, `<autoFilter ref="${af[1]}:${af[2]}${end}"`);
      filter = 'extended';
    }
  } else if (autoFilter && lastDataRow >= startRow && autoFilter.lastCol) {
    filterRef = `A${autoFilter.headerRow}:${getColumnLetter(autoFilter.lastCol)}${lastDataRow}`;
    const next = insertAutoFilter(out, filterRef);
    if (next !== out) { out = next; filter = 'added'; } else filterRef = null;
  }

  return {
    xml: out, lastDataRow, maxCol, written, blocked, capacity, firstFormulaRow, filter, filterRef,
    preservedCols: colRange([...preserved.cols]),
    preservedValues: { count: preserved.valueRefs.length, refs: preserved.valueRefs.slice(0, 5) },
  };
};

// rawRow (array, index 0 = source column A) -> Map(col -> value)
const rowToMap = (rawRow, offset, maxCols = Infinity) => {
  const map = new Map();
  if (!Array.isArray(rawRow)) return map;
  const limit = Math.min(rawRow.length, maxCols);
  for (let i = 0; i < limit; i++) {
    const v = rawRow[i];
    if (v !== undefined && v !== null && v !== '') map.set(i + offset, v);
  }
  return map;
};

// ---------- workbook-level range fix-ups ----------
const absRange = (ref) => ref.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
const quoteSheet = (name) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

const extendDefinedNames = async (zip, patched) => {
  let wb = await readText(zip, 'xl/workbook.xml');
  if (!wb) return;
  for (const { index, lastDataRow } of patched) {
    const re = new RegExp(`(<definedName name="_xlnm\\._FilterDatabase" localSheetId="${index}"[^>]*>)([^<]*)(</definedName>)`);
    wb = wb.replace(re, (m, open, range, close) => {
      const rm = range.match(/^(.*\$[A-Z]+\$)(\d+)$/);
      if (!rm) return m;
      return `${open}${rm[1]}${Math.max(Number(rm[2]), lastDataRow)}${close}`;
    });
  }
  // sheets that just received an <autoFilter> need the hidden _FilterDatabase name Excel expects
  const added = patched
    .filter((p) => p.filterRef && !new RegExp(`<definedName name="_xlnm\\._FilterDatabase" localSheetId="${p.index}"`).test(wb))
    .map((p) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${p.index}" hidden="1">${escapeXml(quoteSheet(p.name))}!${absRange(p.filterRef)}</definedName>`);
  if (added.length) {
    if (wb.includes('</definedNames>')) wb = wb.replace('</definedNames>', () => `${added.join('')}</definedNames>`);
    else if (/<calcPr\b/.test(wb)) wb = wb.replace(/<calcPr\b/, (m) => `<definedNames>${added.join('')}</definedNames>${m}`);
    else wb = wb.replace('</workbook>', () => `<definedNames>${added.join('')}</definedNames></workbook>`);
  }
  writeText(zip, 'xl/workbook.xml', wb);
};

const extendPivotSources = async (zip, patched) => {
  const byName = new Map(patched.map((p) => [p.name, p]));
  const paths = Object.keys(zip.files).filter((p) => /^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/.test(p));
  for (const path of paths) {
    let xml = await readText(zip, path);
    xml = xml.replace(/<worksheetSource\b[^>]*\/>/g, (tag) => {
      const sheet = decodeXml(attr(tag, 'sheet') ?? '');
      const ref = attr(tag, 'ref');
      const p = byName.get(sheet);
      if (!p || !ref) return tag;
      const rm = ref.match(/^([A-Z]+\d+:[A-Z]+)(\d+)$/);
      if (!rm) return tag;
      return tag.replace(/\bref="[^"]*"/, `ref="${rm[1]}${Math.max(Number(rm[2]), p.lastDataRow)}"`);
    });
    writeText(zip, path, xml);
  }
};

// Force Excel to recalc every formula and refresh every pivot cache on open.
export const applyRecalcFlags = async (zip) => {
  let wb = await readText(zip, 'xl/workbook.xml');
  if (wb) {
    const calcPr = wb.match(/<calcPr\b([^>]*?)(\/?)>/);
    if (calcPr) {
      let attrs = calcPr[1];
      attrs = /fullCalcOnLoad=/.test(attrs)
        ? attrs.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"')
        : `${attrs} fullCalcOnLoad="1"`;
      wb = spliceAt(wb, calcPr, `<calcPr${attrs}${calcPr[2]}>`);
    } else {
      wb = wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    }
    writeText(zip, 'xl/workbook.xml', wb);
  }
  const paths = Object.keys(zip.files).filter((p) => /^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/.test(p));
  for (const path of paths) {
    let xml = await readText(zip, path);
    xml = xml.replace(/<pivotCacheDefinition\b([^>]*)>/, (m, attrs) =>
      /refreshOnLoad=/.test(attrs)
        ? `<pivotCacheDefinition${attrs.replace(/refreshOnLoad="[^"]*"/, 'refreshOnLoad="1"')}>`
        : `<pivotCacheDefinition${attrs} refreshOnLoad="1">`);
    writeText(zip, path, xml);
  }
};

// Backwards-compatible helper: ArrayBuffer in, patched ArrayBuffer out.
export const forceRecalcOnOpen = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  await applyRecalcFlags(zip);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
};


// ---------- extra sheets (QA report, changes, ...) ----------
const WORKSHEET_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
const WORKSHEET_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

const aoaToDataRows = (aoa) =>
  (aoa || []).map((row) => {
    const map = new Map();
    (Array.isArray(row) ? row : []).forEach((v, i) => {
      if (v !== undefined && v !== null && v !== '') map.set(i + 1, v instanceof Date ? { v, t: 'date' } : v);
    });
    return map;
  });

const blankSheetXml = () =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<dimension ref="A1:A1"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
  '<sheetData/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';

// best-effort: keep docProps/app.xml's worksheet list in sync (cosmetic, Excel does not validate it)
const registerInAppProps = async (zip, name) => {
  const app = await readText(zip, 'docProps/app.xml');
  if (!app) return;
  const count = app.match(/<vt:lpstr>Worksheets<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>(\d+)<\/vt:i4>/);
  const titles = app.match(/<TitlesOfParts><vt:vector size="(\d+)" baseType="lpstr">([\s\S]*?)<\/vt:vector><\/TitlesOfParts>/);
  if (!count || !titles) return;
  const n = Number(count[1]);
  const entries = [...titles[2].matchAll(/<vt:lpstr>[\s\S]*?<\/vt:lpstr>/g)].map((m) => m[0]);
  if (entries.length < n) return;
  entries.splice(n, 0, `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`);
  let out = spliceAt(app, titles, `<TitlesOfParts><vt:vector size="${entries.length}" baseType="lpstr">${entries.join('')}</vt:vector></TitlesOfParts>`);
  const count2 = out.match(/<vt:lpstr>Worksheets<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>(\d+)<\/vt:i4>/);
  out = spliceAt(out, count2, `<vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${n + 1}</vt:i4>`);
  writeText(zip, 'docProps/app.xml', out);
};

/**
 * Create (or fully replace the contents of) a plain values-only sheet.
 * Sheets that belong to the template (except the app's own, see sheetNames.js) are refused: `skipped: 'protected'`;
 * the same name twice in one run (shared `used` map) is refused as `'duplicate'`.
 * Existing sheets keep their formulas/formatting rules (patchSheetXml semantics).
 * @returns {{ name: string, created: boolean, rows: number }}
 */
export const upsertSheet = async (zip, rawName, aoa, { styles = null, templateSheets, used } = {}) => {
  const sheets = await listSheets(zip);
  const resolved = resolveSheetName(rawName, { templateSheets: templateSheets ?? sheets.map((x) => x.name), used });
  if (resolved.skipped) return { name: resolved.name, skipped: resolved.skipped, created: false, rows: 0, cells: 0 };
  const name = resolved.name;
  let sheet = sheets.find((s) => s.name === name);
  let created = false;

  if (!sheet) {
    created = true;
    const used = Object.keys(zip.files).map((p) => Number(p.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1] || 0));
    const num = Math.max(0, ...used) + 1;
    const path = `xl/worksheets/sheet${num}.xml`;
    let wb = await readText(zip, 'xl/workbook.xml');
    let rels = await readText(zip, 'xl/_rels/workbook.xml.rels');
    let ct = await readText(zip, '[Content_Types].xml');
    if (!wb || !rels || !ct) throw new Error('ไม่พบส่วนประกอบหลักของไฟล์ xlsx');
    const sheetId = Math.max(0, ...[...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1]))) + 1;
    const rId = `rId${Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1}`;
    wb = wb.replace('</sheets>', () => `<sheet name="${escapeXml(name)}" sheetId="${sheetId}" r:id="${rId}"/></sheets>`);
    rels = rels.replace('</Relationships>', () => `<Relationship Id="${rId}" Type="${WORKSHEET_REL}" Target="worksheets/sheet${num}.xml"/></Relationships>`);
    if (!ct.includes(`PartName="/${path}"`)) {
      ct = ct.replace('</Types>', () => `<Override PartName="/${path}" ContentType="${WORKSHEET_CT}"/></Types>`);
    }
    writeText(zip, 'xl/workbook.xml', wb);
    writeText(zip, 'xl/_rels/workbook.xml.rels', rels);
    writeText(zip, '[Content_Types].xml', ct);
    writeText(zip, path, blankSheetXml());
    await registerInAppProps(zip, name);
    sheet = { name, path, index: sheets.length };
  }

  const xml = await readText(zip, sheet.path);
  const parsed = parseSheet(xml);
  const dataRows = aoaToDataRows(aoa);
  const res = patchSheetXml(xml, parsed, { startRow: 1, dataRows, clearThroughRow: parsed.lastRow, styles, highlight: false });
  writeText(zip, sheet.path, res.xml);
  return { name, created, rows: dataRows.length, cells: res.written };
};

// ---------- cellWrites: the one value-cell write primitive ----------
const splitRef = (ref) => {
  const m = String(ref ?? '').match(/^\$?([A-Za-z]+)\$?(\d+)$/);
  return m ? { col: getColumnIndex(m[1].toUpperCase()), row: Number(m[2]) } : null;
};

const isStringCell = (cell) => cell && (cell.t === 's' || cell.t === 'inlineStr' || cell.t === 'str');

// value to store for a target of the given kind -> typed value for buildCell
const coerceForTarget = (value, stringTarget) => {
  if (value === null || value === undefined) return '';
  if (stringTarget) return { v: value instanceof Date ? value.toISOString().slice(0, 10) : String(value), t: 'text' };
  if (value instanceof Date) return { v: value, t: 'date' };
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value).trim();
  if (text !== '' && Number.isFinite(Number(text))) return Number(text);
  return { v: String(value), t: 'text' };
};

/**
 * Write plain values into named cells of existing sheets. Formula cells are never touched.
 * The cell keeps its style (s); the value takes the type of the current target cell
 * (text target -> inline string, number/empty target -> number or date serial).
 * @param {JSZip} zip
 * @param {string} sheetName
 * @param {{ ref: string, value: any, highlight?: boolean }[]} list
 * @returns {Promise<{sheet,ref,before,after,status}[]>}  status: 'written' | 'skipped-formula' | 'skipped-sheet' | 'skipped-ref'
 */
export const writeCells = async (zip, sheetName, list, { styles = null, sst = null, sheets = null } = {}) => {
  const results = [];
  const all = sheets ?? (await listSheets(zip));
  const sheet = all.find((x) => x.name === sheetName);
  if (!sheet?.path || !zip.file(sheet.path)) {
    return list.map((w) => ({ sheet: sheetName, ref: w.ref, before: null, after: null, status: 'skipped-sheet' }));
  }
  const strings = sst ?? (await loadSharedStrings(zip));
  const xml = await readText(zip, sheet.path);
  const parsed = parseSheet(xml);
  const { rows } = parsed;
  let changed = false;

  for (const w of list) {
    const pos = splitRef(w.ref);
    if (!pos) { results.push({ sheet: sheetName, ref: w.ref, before: null, after: null, status: 'skipped-ref' }); continue; }
    const row = rows.get(pos.row);
    const target = row?.cells.get(pos.col);
    const before = target ? cellText(target, strings) : '';
    if (target?.hasFormula) { results.push({ sheet: sheetName, ref: w.ref, before, after: null, status: 'skipped-formula' }); continue; }
    const typed = coerceForTarget(w.value, isStringCell(target));
    let s = target?.s;
    const fmt = numFmtFor(typed);
    if (fmt && styles && !target?.s) s = styles.withNumFmt(s, fmt); // only when the cell has no format of its own
    if (w.highlight && styles) s = styles.highlighted(s);
    const ref = `${getColumnLetter(pos.col)}${pos.row}`;
    const cells = new Map();
    if (row) for (const [c, cell] of row.cells) cells.set(c, cell.xml);
    const xmlCell = buildCell(pos.col, pos.row, typed, s);
    cells.set(pos.col, xmlCell);
    const built = assembleRow(row?.attrs ?? '', pos.row, cells);
    const newCells = new Map(row?.cells ?? []);
    newCells.set(pos.col, parseCell(new RegExp(CELL_RE.source).exec(xmlCell)));
    rows.set(pos.row, { r: pos.row, attrs: built.attrs, cells: newCells, xml: built.xml });
    changed = true;
    const after = typed && typeof typed === 'object' && !(typed instanceof Date) ? typed.v : typed;
    results.push({ sheet: sheetName, ref, before, after: after instanceof Date ? toSerial(after) : after, status: 'written' });
  }

  if (changed) {
    const body = [...rows.values()].sort((a, b) => a.r - b.r).map((r) => r.xml).join('');
    writeText(zip, sheet.path, spliceAt(xml, parsed.sheetData, `<sheetData>${body}</sheetData>`));
  }
  return results;
};

// ---------- entry point ----------
const overflowWarning = (sheet, total, capacity, firstFormulaRow, spilled) =>
  `${sheet}: ข้อมูล ${total} แถว เกินพื้นที่ ${capacity} แถว` +
  (firstFormulaRow ? ` (แถวที่ ${firstFormulaRow} เป็นต้นไปเป็นสูตรของเทมเพลต)` : '') +
  (spilled
    ? ` ส่วนที่เกิน ${spilled} แถวถูกเขียนไว้ใน sheet "${spillSheetName(sheet)}"`
    : ' แถวที่เกินจะไม่ถูกเขียน ให้เพิ่มแถวว่างในเทมเพลตก่อนแถวสูตร หรือเลือกเขียนส่วนที่เกินแยก sheet');

/**
 * @param {ArrayBuffer} templateBuffer  the customer's .xlsx
 * @param {object} opts
 * @param {Record<string, object[]>} opts.processedData  { 'BP Daily': rows, ... }
 * @param {object[]} opts.analyzeRows  [{ plant, rawRow, ... }] already sorted
 * @param {boolean} [opts.highlight=true]
 * @param {{ name: string, aoa: any[][] }[]} [opts.extraSheets]  values-only sheets to add/replace
 * @param {{ sheet: string, ref: string, value: any, highlight?: boolean }[]} [opts.cellWrites]
 * @param {'block'|'spill'} [opts.overflow='block']  rows that do not fit above the template's formula row
 * @param {boolean} [opts.clearBeyondTable=false]  also clear side columns right of N+3 (old behaviour)
 * @param {boolean} [opts.addAutoFilter=true]  add an autoFilter to daily sheets that have none
 * @returns {Promise<{ buffer: ArrayBuffer, report: object }>}
 */
export const patchTemplate = async (templateBuffer, {
  processedData, analyzeRows = [], highlight = true, extraSheets = [], cellWrites = [],
  overflow = 'block', clearBeyondTable = false, addAutoFilter = true,
}) => {
  const zip = await JSZip.loadAsync(templateBuffer);
  const sheets = await listSheets(zip);
  const templateSheets = sheets.map((s) => s.name);
  const sst = await loadSharedStrings(zip);
  const styles = new StyleRegistry(await readText(zip, 'xl/styles.xml'));
  const report = { patched: [], skipped: [], warnings: [], overflow: [], skippedSheets: [], cellWrites: [] };
  const patched = [];
  const used = new Map();
  const spillJobs = [];

  // 1) "<Plant> Daily" sheets: 1:1 copy of the source rows from the header row + 1
  for (const [sheetName, rows] of Object.entries(processedData || {})) {
    const sheet = sheets.find((s) => s.name === sheetName);
    if (!sheet?.path || !zip.file(sheet.path)) {
      report.skipped.push(sheetName);
      continue;
    }
    const xml = await readText(zip, sheet.path);
    const parsed = parseSheet(xml);
    const headerRow = findRowWithText(parsed.rows, sst, 1, 'PART NUMBER') ?? TEMPLATE.dailyHeaderRow;
    const startRow = headerRow + 1;
    const lastCol = lastColWithText(parsed.rows.get(headerRow), sst, 'N+3') ?? TEMPLATE.maxSourceCols;
    const dataRows = rows.map((row) => rowToMap(row.rawRow, 1, lastCol));
    const res = patchSheetXml(xml, parsed, {
      startRow, dataRows, clearThroughRow: parsed.lastRow, styles, highlight,
      zone: { min: 1, max: lastCol }, clearMax: clearBeyondTable ? Infinity : lastCol,
      autoFilter: addAutoFilter ? { headerRow, lastCol } : null,
    });
    writeText(zip, sheet.path, res.xml);
    patched.push({ ...sheet, lastDataRow: res.lastDataRow, filterRef: res.filterRef });
    const entry = {
      sheet: sheetName, rows: dataRows.length - res.blocked.reduce((n, b) => n + b.dropped, 0), startRow, cells: res.written,
      preservedCols: res.preservedCols, preservedValues: res.preservedValues,
    };
    if (res.filter) entry.autoFilter = res.filter;
    report.patched.push(entry);
    if (res.blocked.length) {
      const { indexes } = res.blocked[0];
      report.overflow.push({
        sheet: sheetName, rows: rows.length, capacity: res.capacity,
        dropped: indexes.map((i) => rows[i].partNumber ?? ''),
      });
      if (overflow === 'spill') {
        const header = Array.from({ length: lastCol }, (_, i) => cellText(parsed.rows.get(headerRow)?.cells.get(i + 1), sst));
        spillJobs.push({ sheetName, entry, firstFormulaRow: res.firstFormulaRow, capacity: res.capacity, total: rows.length,
          aoa: [header, ...indexes.map((i) => Array.from({ length: lastCol }, (_, c) => rows[i].rawRow?.[c] ?? ''))] });
      } else {
        report.warnings.push(overflowWarning(sheetName, rows.length, res.capacity, res.firstFormulaRow, 0));
      }
    }
  }

  // 2) "Analyze": column B.. = source columns, plant code in the column after N+3
  const analyze = sheets.find((s) => s.name === ANALYZE_SHEET);
  if (analyze?.path && zip.file(analyze.path)) {
    const xml = await readText(zip, analyze.path);
    const parsed = parseSheet(xml);
    const offset = TEMPLATE.analyzeSourceOffset;
    const headerRow = findRowWithText(parsed.rows, sst, offset, 'PART NUMBER') ?? TEMPLATE.analyzeHeaderRow;
    const startRow = headerRow + 1;
    const n3Col = lastColWithText(parsed.rows.get(headerRow), sst, 'N+3');
    const plantCol = n3Col ? n3Col + 1 : TEMPLATE.analyzePlantCol;
    const maxSourceCols = plantCol - offset;
    const af = xml.match(/<autoFilter ref="[A-Z]+\d+:[A-Z]+(\d+)"/);
    const clearThroughRow = af ? Number(af[1]) : startRow + 300;
    const dataRows = analyzeRows.map((row) => {
      const map = rowToMap(row.rawRow, offset, maxSourceCols);
      map.set(plantCol, row.plant);
      return map;
    });
    const res = patchSheetXml(xml, parsed, {
      startRow, dataRows, clearThroughRow, styles, highlight,
      zone: { min: offset, max: plantCol }, clearMax: clearBeyondTable ? Infinity : plantCol,
      capRow: af ? Number(af[1]) : undefined,
    });
    writeText(zip, analyze.path, res.xml);
    patched.push({ ...analyze, lastDataRow: res.lastDataRow });
    const dropped = res.blocked.reduce((n, b) => n + b.dropped, 0);
    report.patched.push({
      sheet: ANALYZE_SHEET, rows: analyzeRows.length - dropped, startRow, plantCol: getColumnLetter(plantCol), cells: res.written,
      preservedCols: res.preservedCols, preservedValues: res.preservedValues,
    });
    if (dropped) {
      report.overflow.push({
        sheet: ANALYZE_SHEET, rows: analyzeRows.length, capacity: res.capacity,
        dropped: res.blocked[0].indexes.map((i) => analyzeRows[i].partNumber ?? ''),
      });
      report.warnings.push(
        `Analyze: ข้อมูล ${analyzeRows.length} แถว เกินพื้นที่ตารางในเทมเพลต (${res.capacity} แถว) ` +
        'แถวที่เกินไม่ถูกเขียน ให้ขยายตาราง/สูตร key (คอลัมน์ A) ในเทมเพลตก่อนใช้งาน',
      );
    }
  } else {
    report.skipped.push(ANALYZE_SHEET);
  }

  // 3) spill sheets + extra values-only sheets (QA report, change list, ...)
  const upsert = async (name, aoa) => {
    const res = await upsertSheet(zip, name, aoa, { styles, templateSheets, used });
    if (res.skipped) {
      report.skippedSheets.push({ name: res.name, reason: res.skipped });
      report.warnings.push(`ข้าม sheet "${res.name}" ${res.skipped === 'protected' ? 'เพราะเป็น sheet ของเทมเพลต' : 'เพราะชื่อซ้ำกับ sheet ที่เพิ่มไปแล้ว'}`);
    }
    return res;
  };
  for (const job of spillJobs) {
    const res = await upsert(spillSheetName(job.sheetName), job.aoa);
    if (res.skipped) {
      report.warnings.push(overflowWarning(job.sheetName, job.total, job.capacity, job.firstFormulaRow, 0));
      continue;
    }
    job.entry.spilled = job.aoa.length - 1;
    report.warnings.push(overflowWarning(job.sheetName, job.total, job.capacity, job.firstFormulaRow, job.entry.spilled));
    report.patched.push({ sheet: res.name, rows: res.rows, startRow: 1, cells: res.cells, created: res.created });
  }
  for (const extra of extraSheets) {
    if (!extra?.name) continue;
    const res = await upsert(extra.name, extra.aoa || []);
    if (res.skipped) continue;
    report.patched.push({ sheet: res.name, rows: res.rows, startRow: 1, cells: res.cells, created: res.created });
  }

  // 4) value cells in template sheets (header sync etc.); formulas are skipped
  const bySheet = new Map();
  for (const w of cellWrites || []) {
    if (!w?.sheet) continue;
    if (!bySheet.has(w.sheet)) bySheet.set(w.sheet, []);
    bySheet.get(w.sheet).push(w);
  }
  if (bySheet.size) {
    const all = await listSheets(zip);
    for (const [name, list] of bySheet) {
      report.cellWrites.push(...(await writeCells(zip, name, list, { styles, sst, sheets: all })));
    }
  }

  // 5) styles, ranges, recalc flags
  const newStyles = styles.commit();
  if (newStyles) writeText(zip, 'xl/styles.xml', newStyles);
  await extendDefinedNames(zip, patched);
  await extendPivotSources(zip, patched);
  await applyRecalcFlags(zip);

  const buffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, report };
};
