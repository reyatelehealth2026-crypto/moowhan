// Structural OOXML checks that Excel enforces but SheetJS/JSZip do not. Returns a list of error strings.
import JSZip from 'jszip';

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const text = async (zip, p) => (zip.file(p) ? zip.file(p).async('string') : null);

// CT_Worksheet child order (ECMA-376 Part 1, 18.3.1.99)
export const WORKSHEET_ORDER = [
  'sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges',
  'scenarios', 'autoFilter', 'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting',
  'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks',
  'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'drawingHF',
  'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
];

const topLevelChildren = (xml) => {
  const body = xml.replace(/^[\s\S]*?<worksheet\b[^>]*>/, '').replace(/<\/worksheet>\s*$/, '');
  const names = [];
  let depth = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z0-9:]+)\b[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (close) { depth--; continue; }
    if (depth === 0) names.push(name.replace(/^x:/, ''));
    if (!self) depth++;
  }
  return names;
};

const resolve = (base, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};

/** @param {ArrayBuffer} buffer @returns {Promise<string[]>} */
export const validateOoxml = async (buffer) => {
  const errors = [];
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

  // 1) content types cover every part
  const ct = (await text(zip, '[Content_Types].xml')) || '';
  const defaults = new Set([...ct.matchAll(/<Default\b[^>]*>/g)].map((m) => attr(m[0], 'Extension')?.toLowerCase()));
  const overrides = new Set([...ct.matchAll(/<Override\b[^>]*>/g)].map((m) => attr(m[0], 'PartName')));
  for (const n of names) {
    if (n === '[Content_Types].xml') continue;
    const ext = n.split('.').pop().toLowerCase();
    if (!overrides.has(`/${n}`) && !defaults.has(ext)) errors.push(`[Content_Types].xml: ไม่มี content-type ของ part ${n}`);
  }
  // xml parts under xl/ and docProps/ with only the generic xml default are suspicious (custom.xml, pivot parts...)
  for (const n of names) {
    if (/^(xl|docProps)\/.+\.xml$/.test(n) && !overrides.has(`/${n}`)) errors.push(`[Content_Types].xml: missing content-type override for ${n}`);
  }

  // 2) relationship targets exist
  for (const relPath of names.filter((n) => n.endsWith('.rels'))) {
    const owner = relPath.replace(/_rels\//, '').replace(/\.rels$/, '');
    for (const m of (await text(zip, relPath)).matchAll(/<Relationship\b[^>]*>/g)) {
      if (attr(m[0], 'TargetMode') === 'External') continue;
      const target = attr(m[0], 'Target');
      const full = relPath === '_rels/.rels' ? resolve('x', target) : resolve(owner, target);
      if (!zip.file(full)) errors.push(`${relPath}: relationship ${attr(m[0], 'Id')} ชี้ไปที่ ${full} ซึ่งไม่มีในไฟล์`);
    }
  }

  // 3) workbook: r:ids, duplicate sheet names, definedName localSheetId
  const wb = await text(zip, 'xl/workbook.xml');
  if (wb) {
    const rels = (await text(zip, 'xl/_rels/workbook.xml.rels')) || '';
    const ids = new Set([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => attr(m[0], 'Id')));
    const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]);
    const seen = new Set();
    for (const s of sheets) {
      const rid = attr(s, 'r:id');
      if (!ids.has(rid)) errors.push(`xl/workbook.xml: <sheet> r:id ${rid} ไม่มีใน workbook.xml.rels`);
      const nm = (attr(s, 'name') || '').toLowerCase();
      if (seen.has(nm)) errors.push(`xl/workbook.xml: ชื่อ sheet ซ้ำ "${attr(s, 'name')}"`);
      seen.add(nm);
    }
    for (const m of wb.matchAll(/<definedName\b[^>]*>/g)) {
      const l = attr(m[0], 'localSheetId');
      if (l !== undefined && Number(l) >= sheets.length) errors.push(`xl/workbook.xml: definedName ${attr(m[0], 'name')} localSheetId ${l} เกินจำนวน sheet (${sheets.length})`);
    }
  }

  // 4) worksheet element order
  for (const n of names.filter((x) => /^xl\/worksheets\/[^/]+\.xml$/.test(x))) {
    const kids = topLevelChildren(await text(zip, n));
    let last = -1;
    for (const k of kids) {
      const i = WORKSHEET_ORDER.indexOf(k);
      if (i === -1) continue;
      if (i < last) errors.push(`${n}: element order violation — <${k}> ต้องมาก่อน <${WORKSHEET_ORDER[last]}>`);
      last = Math.max(last, i);
    }
  }
  return errors;
};
