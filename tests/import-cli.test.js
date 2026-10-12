import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { expandZip } from '../src/features/import-cli/zip.js';
import { parseEml, MSG_ERROR } from '../src/features/import-cli/eml.js';
import { planFolderImport, uniqueName, writeNoOverwrite, hasTemplateSheets } from '../src/features/import-cli/folder.js';
import { SOURCE_FILES, fixture } from './helpers.js';

const loadJSZip = async () => JSZip;
const base = (p) => p.split('/').pop();

async function fixtureZip(extra = (z) => z) {
  const z = new JSZip();
  SOURCE_FILES.forEach((p) => z.file(`forecast/${base(p)}`, fixture(p)));
  z.file('__MACOSX/forecast/._BP veh 481D.xls', 'x');
  z.file('sub/dir/download.xlsx', fixture('input/download.xlsx'));
  z.file('._junk.xls', 'x');
  const inner = new JSZip(); inner.file('a.xls', 'x');
  z.file('inner.zip', await inner.generateAsync({ type: 'uint8array' }));
  extra(z);
  return z.generateAsync({ type: 'uint8array' });
}

describe('expandZip', () => {
  it('keeps basenames, byte-identical content, skips junk and nested zips', async () => {
    const out = await expandZip(await fixtureZip(), { loadJSZip });
    expect(out.error).toBeUndefined();
    const names = out.files.map((f) => f.name).sort();
    expect(names).toEqual([...SOURCE_FILES.map(base), 'download.xlsx'].sort());
    const bp = out.files.find((f) => f.name === 'BP veh 481D.xls');
    expect(Buffer.from(bp.bytes).equals(Buffer.from(fixture(SOURCE_FILES[0])))).toBe(true);
    expect(out.skipped.find((s) => s.name === 'inner.zip').reason).toMatch(/ซ้อน/);
    expect(out.skipped.some((s) => s.name === '._junk.xls')).toBe(true);
  });

  it('refuses 201 entries with a Thai message and no files', async () => {
    const buf = await fixtureZip((z) => { for (let i = 0; i < 200; i++) z.file(`f${i}.txt`, 'x'); });
    const out = await expandZip(buf, { loadJSZip });
    expect(out.files).toEqual([]);
    expect(out.error).toMatch(/เกินกำหนด/);
  });

  it('refuses when inflated size exceeds the limit', async () => {
    const z = new JSZip();
    z.file('BP big.xls', new Uint8Array(2048));
    z.file('BPK big.xls', new Uint8Array(2048));
    const buf = await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const out = await expandZip(buf, { loadJSZip, limits: { maxEntries: 200, maxInflatedBytes: 3000 } });
    expect(out.files).toEqual([]);
    expect(out.error).toMatch(/50 MB/);
  });

  it('reports a corrupt archive in Thai', async () => {
    const out = await expandZip(new Uint8Array([1, 2, 3]), { loadJSZip });
    expect(out.error).toMatch(/เปิดไฟล์ .zip ไม่ได้/);
  });
});

const b64 = (buf) => Buffer.from(buf).toString('base64').replace(/(.{76})/g, '$1\r\n');
const part = (headers, body) => `${headers}\r\n\r\n${body}\r\n`;
function eml(parts) {
  return Buffer.from([
    'From: secret-sender@example.com', 'Subject: HEADER_SENTINEL_9', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="BND"', '', '--BND',
    part('Content-Type: text/plain; charset=utf-8', 'BODY_SENTINEL_7'),
    ...parts.map((p) => `--BND\r\n${p}`), '--BND--', ''].join('\r\n'));
}

describe('parseEml', () => {
  const xls = fixture(SOURCE_FILES[0]);
  const nameB64 = '=?UTF-8?B?' + Buffer.from('BP แผน 481D.xls').toString('base64') + '?=';
  const rfc2231 = "UTF-8''" + encodeURIComponent('GW แผน.xls');

  it('decodes RFC 2047 and RFC 2231 names, skips quoted-printable, never leaks body/headers', async () => {
    const buf = eml([
      part(`Content-Type: application/vnd.ms-excel\r\nContent-Disposition: attachment; filename="${nameB64}"\r\nContent-Transfer-Encoding: base64`, b64(xls)),
      part(`Content-Type: application/vnd.ms-excel\r\nContent-Disposition: attachment; filename*=${rfc2231}\r\nContent-Transfer-Encoding: base64`, b64(xls)),
      part('Content-Type: application/vnd.ms-excel; name="SR qp.xls"\r\nContent-Transfer-Encoding: quoted-printable', '=D0=CF'),
    ]);
    const out = await parseEml(buf, { loadJSZip });
    expect(out.files.map((f) => f.name)).toEqual(['BP แผน 481D.xls', 'GW แผน.xls']);
    expect(Buffer.from(out.files[0].bytes).equals(Buffer.from(xls))).toBe(true);
    expect(out.warnings.join()).toMatch(/quoted-printable/);
    const dump = JSON.stringify({ ...out, files: out.files.map((f) => f.name) });
    expect(dump).not.toMatch(/BODY_SENTINEL_7|HEADER_SENTINEL_9|secret-sender/);
  });

  it('expands a .zip attachment one level', async () => {
    const zbuf = await fixtureZip();
    const out = await parseEml(eml([part('Content-Type: application/zip; name="all.zip"\r\nContent-Transfer-Encoding: base64', b64(zbuf))]), { loadJSZip });
    expect(out.files).toHaveLength(6);
  });

  it('rejects .msg with the Thai message', async () => {
    const out = await parseEml(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]));
    expect(out.error).toBe(MSG_ERROR);
    expect(out.files).toEqual([]);
  });
});

// ---------- contract: the CLI's import graph stays free of UI / bundler / network code ----------
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function crawl(entry) {
  const seen = new Set();
  const external = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        if (/\.(js|mjs|jsx)$/.test(target) && fs.existsSync(target)) visit(target);
        else if (/\.json$/.test(target)) seen.add(target);
        else external.add(`${spec} (from ${path.relative(repo, file)})`);
      } else external.add(spec);
    }
  };
  visit(entry);
  return { files: [...seen].map((f) => path.relative(repo, f).replaceAll('\\', '/')), external: [...external] };
}

describe('CLI import contract', () => {
  const { files, external } = crawl(path.join(repo, 'scripts', 'consolidate.mjs'));

  it('reaches the pipeline modules', () => {
    expect(files).toEqual(expect.arrayContaining(['src/features/import-cli/cli.js', 'src/features/qa-engine/engine.js', 'src/lib/excel/verifyExport.js']));
  });
  it('imports no react, vite, components, feature registry or .jsx', () => {
    expect(files.filter((f) => /\.jsx$|(^|\/)components\/|features\/index\.js$|features\/visibility\.js$/.test(f))).toEqual([]);
    expect(external.filter((e) => /^(react|react-dom|vite|@vitejs|tailwindcss)/.test(e))).toEqual([]);
  });
  it('uses no network API', () => {
    const net = /\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(http|https|net|dgram|tls)\b|navigator\.sendBeacon/;
    files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs')).forEach((f) => {
      expect(net.test(fs.readFileSync(path.join(repo, f), 'utf8')), f).toBe(false);
    });
  });
  it('only needs libraries that are already dependencies', () => {
    const allowed = new Set(['xlsx', 'jszip']);
    const bare = external.filter((e) => !e.startsWith('node:') && !allowed.has(e) && !e.includes(' (from '));
    expect(bare).toEqual([]);
  });
});

// ---------- folder planning ----------

const SHEETS = ['BP Daily', 'BPK Daily', 'GW Daily', 'SR Daily', 'Analyze', 'Summary'];
const entry = (name, extra = {}) => ({ name, size: 10, lastModified: 1, ...extra });

describe('planFolderImport', () => {
  it('picks the template with Daily+Analyze sheets, lists previous output and skipped files', () => {
    const plan = planFolderImport([
      entry('BP veh 481D.xls'), entry('BPK packing 481D.xls'), entry('GW veh DG7.xls'), entry('SR veh 481D.xls'),
      entry('company.xlsx', { sheets: SHEETS, lastModified: 5 }),
      entry('old company.xlsx', { sheets: SHEETS, lastModified: 2 }),
      entry('Production_Updated_Feb26_2026-02-05.xlsx', { sheets: SHEETS }),
      entry('run_202602.json'),
      entry('download.xlsx', { sheets: ['Sheet1'] }),
      entry('~$company.xlsx'), entry('notes.txt'),
    ]);
    expect(plan.template.name).toBe('company.xlsx');
    expect(plan.sources.map((s) => s.name)).toEqual(['BP veh 481D.xls', 'BPK packing 481D.xls', 'GW veh DG7.xls', 'SR veh 481D.xls']);
    expect(plan.previousOutput.map((e) => e.name).sort()).toEqual(['Production_Updated_Feb26_2026-02-05.xlsx', 'run_202602.json']);
    const reasons = Object.fromEntries(plan.skipped.map((s) => [s.name, s.reason]));
    expect(reasons['old company.xlsx']).toMatch(/ใหม่กว่า/);
    expect(reasons['download.xlsx']).toMatch(/จัดประเภท/);
    expect(reasons['~$company.xlsx']).toMatch(/ชั่วคราว/);
    expect(reasons['notes.txt']).toMatch(/ไม่ใช่ไฟล์ Excel/);
  });

  it('returns no template when no workbook has the required sheets', () => {
    const plan = planFolderImport([entry('BP a.xls'), entry('x.xlsx', { sheets: ['Analyze'] })]);
    expect(plan.template).toBeNull();
    expect(hasTemplateSheets(['Analyze'])).toBe(false);
  });
});

describe('never overwrite', () => {
  it('uniqueName adds _v2, _v3', () => {
    expect(uniqueName('a.xlsx', [])).toBe('a.xlsx');
    expect(uniqueName('a.xlsx', ['a.xlsx'])).toBe('a_v2.xlsx');
    expect(uniqueName('a.xlsx', ['a.xlsx', 'a_v2.xlsx'])).toBe('a_v3.xlsx');
  });

  it('writeNoOverwrite keeps an existing file untouched', async () => {
    const files = new Map([['out.xlsx', 'old']]);
    const dir = {
      async *entries() { for (const k of files.keys()) yield [k, { kind: 'file' }]; },
      async getFileHandle(name) { return { async createWritable() { return { async write(b) { files.set(name, b); }, async close() {} }; } }; },
    };
    expect(await writeNoOverwrite(dir, 'out.xlsx', 'new')).toBe('out_v2.xlsx');
    expect(files.get('out.xlsx')).toBe('old');
    expect(files.get('out_v2.xlsx')).toBe('new');
  });

  it('the folder button only renders when showDirectoryPicker exists', async () => {
    const { default: feature } = await import('../src/features/import-cli/index.jsx');
    const ctx = { state: {}, actions: {} };
    expect(feature.headerActions(ctx)).toEqual([]);
    globalThis.window = { showDirectoryPicker: () => {} };
    try {
      const [a] = feature.headerActions(ctx);
      expect(a.label).toBe('เปิดโฟลเดอร์เดือนนี้ (ทดลอง – Chrome/Edge)');
    } finally { delete globalThis.window; }
  });
});
