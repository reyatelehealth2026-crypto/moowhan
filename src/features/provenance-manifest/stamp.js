// Provenance stamp: docProps/custom.xml inside the exported .xlsx (pure; takes a JSZip instance).
// Holds only run facts (no creator names). `exportedAt` is written only when the caller passes it.
import { sha256 } from '../../utils/hash.js';
import { APP_VERSION } from '../../lib/appVersion.js';

export const CUSTOM_PATH = 'docProps/custom.xml';
const PREFIX = 'moowhan.';
const CUSTOM_CT = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';
const CUSTOM_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
const FMTID = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';
const EMPTY = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
const ZIP_EPOCH = Date.UTC(1980, 0, 1); // new parts get a fixed date so output is byte-reproducible

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const read = async (zip, path) => { const f = zip.file(path); return f ? f.async('string') : null; };
const put = (zip, path, content) =>
  zip.file(path, content, { createFolders: false, date: zip.files[path]?.date ?? new Date(ZIP_EPOCH) });

/** Facts for the stamp. `now` (Date | ISO string) is optional: without it there is no exportedAt. */
export const stampSubset = async (state, { now } = {}) => {
  const files = (state.sourceFiles || []).filter((f) => f.status !== 'error');
  const hashes = files.map((f) => f.sha256 || '').sort();
  const pm = state.productionMonth;
  const subset = {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    productionMonth: pm ? `${pm.year}${String(pm.month).padStart(2, '0')}` : '',
    templateSha256: state.template?.sha256 || '',
    inputsHash: hashes.length ? await sha256(hashes.join('\n')) : '',
  };
  if (now) subset.exportedAt = new Date(now).toISOString();
  return subset;
};

const KEYS = ['schemaVersion', 'appVersion', 'productionMonth', 'templateSha256', 'inputsHash', 'exportedAt'];

/** Writes (or refreshes) the moowhan.* custom properties, Content_Types override and package relationship. */
export const writeProvenance = async (zip, subset) => {
  if (!subset) return false;
  const current = (await read(zip, CUSTOM_PATH)) || EMPTY;
  // keep foreign properties, drop our previous ones
  const kept = [...current.matchAll(/<property\b[^>]*?name="([^"]*)"[^>]*>[\s\S]*?<\/property>/g)]
    .filter((m) => !unesc(m[1]).startsWith(PREFIX));
  const pids = kept.map((m) => Number(m[0].match(/pid="(\d+)"/)?.[1] || 0));
  let pid = Math.max(1, ...pids);
  const ours = KEYS.filter((k) => subset[k] !== undefined && subset[k] !== null && subset[k] !== '').map((k) => {
    pid += 1;
    return `<property fmtid="${FMTID}" pid="${pid}" name="${PREFIX}${k}"><vt:lpwstr>${esc(subset[k])}</vt:lpwstr></property>`;
  });
  const head = current.slice(0, current.search(/<Properties\b[^>]*>/) + (current.match(/<Properties\b[^>]*>/)?.[0].length || 0));
  put(zip, CUSTOM_PATH, `${head}${kept.map((m) => m[0]).join('')}${ours.join('')}</Properties>`);

  let ct = await read(zip, '[Content_Types].xml');
  if (ct && !ct.includes('PartName="/docProps/custom.xml"')) {
    ct = ct.replace('</Types>', `<Override PartName="/docProps/custom.xml" ContentType="${CUSTOM_CT}"/></Types>`);
    put(zip, '[Content_Types].xml', ct);
  }
  let rels = await read(zip, '_rels/.rels');
  if (rels && !rels.includes(CUSTOM_REL)) {
    let n = 1;
    while (rels.includes(`Id="rId${n}"`)) n += 1;
    rels = rels.replace('</Relationships>', `<Relationship Id="rId${n}" Type="${CUSTOM_REL}" Target="docProps/custom.xml"/></Relationships>`);
    put(zip, '_rels/.rels', rels);
  }
  return true;
};

/** Reads the stamp back. null = no stamp ("unknown", never "clean"). */
export const readProvenance = async (zip) => {
  const xml = await read(zip, CUSTOM_PATH);
  if (!xml) return null;
  const out = {};
  for (const m of xml.matchAll(/<property\b[^>]*?name="([^"]*)"[^>]*>\s*<vt:\w+>([\s\S]*?)<\/vt:\w+>\s*<\/property>/g)) {
    const name = unesc(m[1]);
    if (name.startsWith(PREFIX)) out[name.slice(PREFIX.length)] = unesc(m[2]);
  }
  if (!Object.keys(out).length) return null;
  if (out.schemaVersion !== undefined) out.schemaVersion = Number(out.schemaVersion);
  return out;
};
