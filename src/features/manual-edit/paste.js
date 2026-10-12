// Bulk adjustments pasted from Excel/CSV. Pure.
import { MONTH_KEYS } from '../../constants.js';
import { REASON_MAX, MONTH_LABELS } from './edits.js';
import { sanitizeCellText } from './notes.js';

export const MAX_LINES = 500;

// header alias -> field (compared after lower-casing and dropping spaces, '_' and '.')
const ALIASES = {
  plant: 'plant', 'โรงงาน': 'plant',
  partnumber: 'partNumber', part: 'partNumber', partno: 'partNumber', 'พาร์ท': 'partNumber',
  dock: 'dock', dockcode: 'dock', 'ด็อก': 'dock',
  n: 'n', 'n+0': 'n', 'n+1': 'n1', n1: 'n1', 'n+2': 'n2', n2: 'n2', 'n+3': 'n3', n3: 'n3',
  'เหตุผล': 'reason', reason: 'reason', 'หมายเหตุ': 'reason', note: 'reason',
};
const DEFAULT_ORDER = ['plant', 'partNumber', 'dock', 'n', 'n1', 'n2', 'n3', 'reason'];
const aliasOf = (h) => ALIASES[String(h ?? '').toLowerCase().replace(/[\s_.]/g, '')];

/** Quote-aware split of the whole text into records of fields. */
const parseRecords = (text, delim) => {
  const records = [];
  let rec = [];
  let field = '';
  let quoted = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  const endField = () => { rec.push(field); field = ''; };
  const endRecord = () => { endField(); if (rec.some((f) => f.trim() !== '')) records.push(rec); rec = []; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) endField();
    else if (c === '\n') endRecord();
    else if (c !== '\r') field += c;
  }
  endRecord();
  return records;
};

const detectDelimiter = (text) => {
  const first = String(text ?? '').split(/\r?\n/).find((l) => l.trim()) || '';
  return first.includes('\t') ? '\t' : ',';
};

/**
 * -> { items:[{ line, plant, partNumber, dock, n?, n1?, n2?, n3?, reason }], errors:[{line,message}], truncated }
 * Delimiter (comma/tab) and header row are auto-detected; without a header the order is
 * Plant, Part Number, Dock, N, N+1, N+2, N+3, เหตุผล.
 */
export const parseAdjustments = (text, { maxLines = MAX_LINES } = {}) => {
  const records = parseRecords(text, detectDelimiter(text));
  const errors = [];
  if (!records.length) return { items: [], errors, truncated: false };
  let order = DEFAULT_ORDER;
  let start = 0;
  const headerFields = records[0].map(aliasOf);
  if (headerFields.includes('partNumber')) { order = headerFields; start = 1; }
  const body = records.slice(start);
  const truncated = body.length > maxLines;
  const items = [];
  body.slice(0, maxLines).forEach((rec, i) => {
    const line = start + i + 1;
    const o = { line, plant: '', partNumber: '', dock: '', reason: '' };
    rec.forEach((raw, c) => {
      const f = order[c];
      if (!f) return;
      const v = raw.trim();
      if (MONTH_KEYS.includes(f)) {
        if (v === '') return;
        const clean = v.replace(/,/g, '');
        if (!/^\d+$/.test(clean)) { errors.push({ line, message: `บรรทัด ${line}: ${MONTH_LABELS[MONTH_KEYS.indexOf(f)]} "${v}" ต้องเป็นจำนวนเต็ม 0 ขึ้นไป` }); o.invalid = true; return; }
        o[f] = Number(clean);
      } else if (f === 'reason') o.reason = sanitizeCellText(v, REASON_MAX);
      else o[f] = v;
    });
    if (!o.partNumber) { errors.push({ line, message: `บรรทัด ${line}: ไม่มี Part Number` }); return; }
    if (o.invalid) return;
    if (!MONTH_KEYS.some((k) => o[k] !== undefined)) { errors.push({ line, message: `บรรทัด ${line}: ไม่มีตัวเลข N..N+3 ให้แก้` }); return; }
    items.push(o);
  });
  return { items, errors, truncated };
};

const norm = (v) => String(v ?? '').trim().toUpperCase();

/**
 * Matches pasted items against processedData.
 * status: 'ตรงกัน' | 'ต้องระบุ Dock' (candidates) | 'ไม่พบ' | 'ไม่เปลี่ยน'
 * -> [{ item, status, candidates, sheet, rowId, row, before, after }]
 */
export const matchAdjustments = (list, processedData) => {
  const all = [];
  Object.entries(processedData || {}).forEach(([sheet, rows]) => {
    const plant = sheet.split(' ')[0];
    rows.forEach((row) => all.push({ sheet, plant, row }));
  });
  return (list || []).map((item) => {
    let hits = all.filter((h) => norm(h.row.partNumber) === norm(item.partNumber));
    if (item.plant) hits = hits.filter((h) => h.plant === norm(item.plant));
    if (item.dock) hits = hits.filter((h) => norm(h.row.dockCode) === norm(item.dock));
    if (!hits.length) return { item, status: 'ไม่พบ', candidates: [] };
    if (hits.length > 1) {
      const samePlant = new Set(hits.map((h) => h.plant)).size === 1;
      const candidates = hits.map((h) => (samePlant ? String(h.row.dockCode ?? '').trim() : `${h.plant}/${String(h.row.dockCode ?? '').trim()}`));
      return { item, status: 'ต้องระบุ Dock', candidates };
    }
    const { row, sheet } = hits[0];
    const before = {};
    const after = {};
    MONTH_KEYS.forEach((k) => {
      if (item[k] === undefined) return;
      before[k] = row[k];
      after[k] = item[k];
    });
    const changed = MONTH_KEYS.some((k) => after[k] !== undefined && after[k] !== before[k]);
    return { item, status: changed ? 'ตรงกัน' : 'ไม่เปลี่ยน', candidates: [], sheet, rowId: row.id, row, before, after };
  });
};

/** Batch items for actions.updateRowsBatch from the 'ตรงกัน' matches. */
export const matchesToItems = (matches, { strategy, reason: fallback = '' } = {}) =>
  matches.filter((m) => m.status === 'ตรงกัน').map((m) => ({
    sheet: m.sheet, rowId: m.rowId, kind: 'total', patch: m.after, strategy, reason: m.item.reason || fallback,
  }));

const csvCell = (v) => {
  const s = sanitizeCellText(v);
  return /[",\r\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Applied edits as CSV in the same format parseAdjustments reads (total edits only; day moves are skipped). */
export const exportEditsCsv = (ledger) => {
  const lines = [['Plant', 'Part Number', 'Dock', 'N', 'N+1', 'N+2', 'N+3', 'เหตุผล']];
  (ledger || []).filter((e) => e.kind === 'total').forEach((e) => {
    lines.push([e.plant, e.partNumber, e.dockCode, ...MONTH_KEYS.map((k) => e.patch?.[k] ?? ''), e.reason]);
  });
  return `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}`;
};
