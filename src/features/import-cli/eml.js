// Pure .eml intake: walks the MIME tree and returns base64 attachments that look like source files.
// Message headers and bodies are never returned, logged or stored.
import { baseName, expandZip } from './zip.js';

export const MSG_ERROR = 'ไฟล์ .msg (Outlook) ยังไม่รองรับ - บันทึกอีเมลเป็น .eml หรือลากไฟล์แนบออกมาก่อน';
const SOURCE_EXT = /\.(xls|xlsx)$/i;

export const isMsgBytes = (u8) => u8.length >= 4 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0;

const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return s; };
const b64ToBytes = (s) => { const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

// header block -> { lower-name: value } with folded lines unfolded
const parseHeaders = (block) => {
  const out = {};
  block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  });
  return out;
};
const splitPart = (raw) => {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) } : { head: raw, body: '' };
};
const param = (value, key) => {
  const re = new RegExp(`(?:^|[;\\s])${key}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i');
  const m = re.exec(value || '');
  return m ? (m[1] ?? m[2]) : null;
};

// RFC 2047 encoded-word: =?UTF-8?B?...?= / =?UTF-8?Q?...?=
export const decodeWords = (s) =>
  String(s).replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, text) => {
    try {
      const bytes = enc.toUpperCase() === 'B'
        ? b64ToBytes(text)
        : Uint8Array.from(text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes);
    } catch { return text; }
  }).replace(/\?=\s+=\?/g, '');

// RFC 2231: filename*=UTF-8''%E0%B8... (and filename*0*= continuations)
const rfc2231 = (value, key) => {
  const ext = param(value, `${key}\\*`);
  if (ext) {
    const m = /^([^']*)'[^']*'(.*)$/.exec(ext);
    if (m) {
      try { return decodeURIComponent(m[2]); } catch { return m[2]; }
    }
  }
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const v = param(value, `${key}\\*${i}\\*?`);
    if (v == null) break;
    parts.push(v);
  }
  if (parts.length) {
    const joined = parts.join('');
    const m = /^([^']*)'[^']*'(.*)$/.exec(joined);
    try { return decodeURIComponent(m ? m[2] : joined); } catch { return joined; }
  }
  return null;
};

const filenameOf = (headers) => {
  const cd = headers['content-disposition'] || '';
  const ct = headers['content-type'] || '';
  const raw = rfc2231(cd, 'filename') ?? param(cd, 'filename') ?? rfc2231(ct, 'name') ?? param(ct, 'name');
  return raw ? baseName(decodeWords(raw)) : '';
};

function walk(raw, acc) {
  const { head, body } = splitPart(raw);
  const headers = parseHeaders(head);
  const ct = headers['content-type'] || 'text/plain';
  if (/^multipart\//i.test(ct)) {
    const boundary = param(ct, 'boundary');
    if (!boundary) return;
    const marker = `--${boundary}`;
    body.split(marker).slice(1).forEach((chunk) => {
      if (chunk.startsWith('--')) return;
      walk(chunk.replace(/^\r?\n/, ''), acc);
    });
    return;
  }
  const name = filenameOf(headers);
  if (!name) return; // body text etc: dropped
  const enc = (headers['content-transfer-encoding'] || '').toLowerCase();
  const isZip = /\.zip$/i.test(name);
  if (!isZip && !SOURCE_EXT.test(name)) { acc.skipped.push({ name, reason: 'ไม่ใช่ไฟล์ .xls/.xlsx' }); return; }
  if (enc === 'quoted-printable') { acc.warnings.push(`ข้ามไฟล์แนบ ${name}: เข้ารหัส quoted-printable ไม่รองรับ`); acc.skipped.push({ name, reason: 'quoted-printable' }); return; }
  if (enc !== 'base64') { acc.warnings.push(`ข้ามไฟล์แนบ ${name}: รูปแบบการเข้ารหัสไม่รองรับ`); acc.skipped.push({ name, reason: 'การเข้ารหัสไม่รองรับ' }); return; }
  acc.attachments.push({ name, bytes: b64ToBytes(body) });
}

/**
 * parseEml(bytes, { loadZipLib }) -> { files:[{name, bytes, lastModified}], skipped, warnings, error? }
 * A .zip attachment is expanded one level.
 */
export async function parseEml(input, opts = {}) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (isMsgBytes(u8)) return { files: [], skipped: [], warnings: [], error: MSG_ERROR };
  const acc = { attachments: [], skipped: [], warnings: [] };
  try { walk(latin1(u8), acc); } catch { return { files: [], skipped: [], warnings: [], error: 'อ่านไฟล์ .eml ไม่ได้ – รูปแบบอีเมลไม่ถูกต้อง' }; }
  const files = [];
  const now = Date.now();
  for (const a of acc.attachments) {
    if (/\.zip$/i.test(a.name)) {
      const z = await expandZip(a.bytes, opts);
      if (z.error) { acc.warnings.push(`${a.name}: ${z.error}`); continue; }
      files.push(...z.files);
      acc.skipped.push(...z.skipped.map((s) => ({ ...s, name: s.name })));
    } else files.push({ name: a.name, bytes: a.bytes, lastModified: now });
  }
  return { files, skipped: acc.skipped, warnings: acc.warnings };
}
