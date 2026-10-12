// Variants of template.xlsx derived by zip-editing with JSZip (SheetJS cannot write pivot tables).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const baseTemplate = () => {
  const b = fs.readFileSync(path.join(ROOT, 'template.xlsx'));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sheetPath = async (zip, name) => {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const m = wb.match(new RegExp(`<sheet\\b[^>]*name="${esc(name)}"[^>]*r:id="([^"]+)"`));
  if (!m) throw new Error(`ไม่พบ sheet ${name}`);
  const t = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${m[1]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${m[1]}"`));
  return `xl/${t[1].replace(/^\/?(xl\/)?/, '')}`;
};

/**
 * @param {object} [o]
 * @param {{from:string,to:string}} [o.renameSheet]
 * @param {string} [o.dropSheet]  hides nothing: removes the sheet from workbook.xml (parts stay)
 * @param {{sheet:string,moveTo:number}} [o.sumRow]  moves the first formula row of a sheet to row `moveTo`
 * @param {'xls'} [o.format]  returns a BIFF8 workbook (values only, with Sheet1) so the exporter falls back
 * @returns {Promise<ArrayBuffer>}
 */
export const makeTemplate = async (o = {}) => {
  if (o.format === 'xls') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['เทมเพลตเก่า', 1], ['ค่า', 2]]), 'Sheet1');
    const out = XLSX.write(wb, { bookType: 'biff8', type: 'buffer' });
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  }
  const zip = await JSZip.loadAsync(baseTemplate());
  if (o.renameSheet) {
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace(`name="${o.renameSheet.from}"`, `name="${o.renameSheet.to}"`);
    zip.file('xl/workbook.xml', wb);
  }
  if (o.dropSheet) {
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace(new RegExp(`<sheet\\b[^>]*name="${esc(o.dropSheet)}"[^>]*/>`), '');
    zip.file('xl/workbook.xml', wb);
  }
  if (o.sumRow) {
    const p = await sheetPath(zip, o.sumRow.sheet);
    let xml = await zip.file(p).async('string');
    const rows = [...xml.matchAll(/<row r="(\d+)"[^>]*>(?:(?!<\/row>)[\s\S])*<\/row>/g)];
    // the sum row is the first row below the table header (row 13) with a formula inside the table columns (A..EF)
    const colNo = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const hasTableFormula = (xmlRow) => [...xmlRow.matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:(?!<\/c>)[\s\S])*?<f\b/g)].some((c) => colNo(c[1]) <= 136);
    const m = rows.find((r) => Number(r[1]) > 13 && hasTableFormula(r[0]));
    if (!m) throw new Error('ไม่พบแถวสูตร');
    const from = Number(m[1]);
    const to = o.sumRow.moveTo;
    const moved = m[0].replace(new RegExp(`<row r="${from}"`), `<row r="${to}"`).replace(new RegExp(`(<c r="[A-Z]+)${from}"`, 'g'), `$1${to}"`);
    // drop the old sum row and every row at/after the target so the sheet XML stays ordered
    for (const r of rows) if (Number(r[1]) === from || Number(r[1]) >= to) xml = xml.replace(r[0], '');
    xml = xml.replace('</sheetData>', `${moved}</sheetData>`);
    zip.file(p, xml);
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
};
