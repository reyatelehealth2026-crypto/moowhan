import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { expandZip } from '../src/features/import-cli/zip.js';
import { parseEml, MSG_ERROR } from '../src/features/import-cli/eml.js';
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
