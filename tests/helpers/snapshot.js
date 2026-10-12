// Cell-level snapshot of an exported workbook, read at XML level (no SheetJS) so styles/types are visible.
import JSZip from 'jszip';

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const text = async (zip, p) => (zip.file(p) ? zip.file(p).async('string') : '');

const sheetFiles = async (zip) => {
  const wb = await text(zip, 'xl/workbook.xml');
  const rels = await text(zip, 'xl/_rels/workbook.xml.rels');
  const map = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) map[attr(m[0], 'Id')] = attr(m[0], 'Target');
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const t = map[attr(m[0], 'r:id')] || '';
    return { name: decode(attr(m[0], 'name')), path: t.startsWith('/') ? t.slice(1) : `xl/${t}` };
  });
};

/**
 * @param {ArrayBuffer} buffer  exported .xlsx
 * @param {{ sheets?: string[] }} [opts]  sheets whose cells are listed (default: Daily sheets + Analyze)
 */
export const snapshotWorkbook = async (buffer, { sheets: only = ['BP Daily', 'BPK Daily', 'GW Daily', 'SR Daily', 'Analyze'] } = {}) => {
  const zip = await JSZip.loadAsync(buffer);
  const sst = [...(await text(zip, 'xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(''));
  const files = await sheetFiles(zip);
  const cells = {};
  const meta = { dimension: {}, autoFilter: {} };
  for (const f of files) {
    const xml = await text(zip, f.path);
    meta.dimension[f.name] = attr(xml.match(/<dimension\b[^>]*>/)?.[0] || '', 'ref') ?? null;
    meta.autoFilter[f.name] = attr(xml.match(/<autoFilter\b[^>]*>/)?.[0] || '', 'ref') ?? null;
    if (!only.includes(f.name)) continue;
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(m[1], 'r');
      const inner = m[2] || '';
      if (/<f\b/.test(inner)) { cells[`${f.name}!${ref}`] = { f: 1 }; continue; }
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1];
      if (raw === undefined) continue;
      const t = attr(m[1], 't') || 'n';
      const v = t === 's' ? sst[Number(raw)] : decode(raw);
      cells[`${f.name}!${ref}`] = { v, t: t === 's' ? 'str' : t, s: attr(m[1], 's') ?? null };
    }
  }
  const workbook = await text(zip, 'xl/workbook.xml');
  meta.filterDatabase = [...workbook.matchAll(/<definedName\b[^>]*name="_xlnm\._FilterDatabase"[^>]*>([^<]*)</g)].map((m) => decode(m[1])).sort();
  meta.pivotSources = [];
  for (const p of Object.keys(zip.files).filter((n) => /pivotCacheDefinition\d+\.xml$/.test(n)).sort()) {
    meta.pivotSources.push(...[...(await text(zip, p)).matchAll(/<worksheetSource\b[^>]*>/g)].map((m) => `${attr(m[0], 'sheet')}!${attr(m[0], 'ref')}`));
  }
  const styles = await text(zip, 'xl/styles.xml');
  meta.styles = Object.fromEntries(['numFmts', 'fonts', 'fills', 'borders', 'cellXfs'].map((k) => [k, Number(attr(styles.match(new RegExp(`<${k}\\b[^>]*>`))?.[0] || '', 'count') ?? 0)]));
  const parts = [...new Set(Object.keys(zip.files).filter((n) => !zip.files[n].dir))].sort();
  return { meta, parts, cells };
};

/** Human-readable diff: refs added / removed / changed. */
export const diffSnapshots = (expected, actual) => {
  const lines = [];
  const ek = expected.cells, ak = actual.cells;
  for (const k of Object.keys(ak)) if (!(k in ek)) lines.push(`+ ${k} = ${JSON.stringify(ak[k])}`);
  for (const k of Object.keys(ek)) if (!(k in ak)) lines.push(`- ${k} (was ${JSON.stringify(ek[k])})`);
  for (const k of Object.keys(ek)) if (k in ak && JSON.stringify(ek[k]) !== JSON.stringify(ak[k])) lines.push(`~ ${k}: ${JSON.stringify(ek[k])} -> ${JSON.stringify(ak[k])}`);
  for (const key of ['meta', 'parts']) if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) lines.push(`~ ${key} differs`);
  return lines;
};
