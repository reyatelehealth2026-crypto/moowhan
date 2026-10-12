// ==================== MANUAL EDITS: PURE CORE (no DOM / React) ====================
// Row model: processedData rows (see readSource). An edit never mutates its input: it returns new row objects.
//   row.original     snapshot { n, n1, n2, n3, rawRow } taken on the first edit
//   row.edited       true while any cell differs from `original`
//   row.editedCells  0-based rawRow indexes that differ from `original` (the patcher paints them amber)
import { MONTH_KEYS } from '../../constants.js';
import { dayValues, monthTotalCol, sumArray } from '../../lib/excel/daily.js';
import { sanitizeCellText } from './notes.js';
import { formatDate } from '../../utils/format.js';

export const STRATEGIES = {
  lastWorkingDay: 'ปรับวันทำงานสุดท้าย',
  proportional: 'กระจายตามสัดส่วน',
  none: 'ไม่ปรับวัน',
};
export const DEFAULT_STRATEGY = 'lastWorkingDay';
export const MONTH_LABELS = ['N', 'N+1', 'N+2', 'N+3'];
export const INT_ERROR = 'ต้องเป็นจำนวนเต็ม 0 ขึ้นไป';
export const REASON_MAX = 120;

const num = (v) => Number(v) || 0;
const plantOfSheet = (sheet) => String(sheet || '').split(' ')[0];
const norm = (v) => String(v ?? '').trim().toUpperCase();

/** `${plant}|${partNumber}|${dockCode}` normalised (trim + uppercase). */
export const editKey = (row, plant) => `${norm(plant ?? row?.plant)}|${norm(row?.partNumber)}|${norm(row?.dockCode)}`;

const parseIntStrict = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null;
  const s = String(v ?? '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
};

/** Day descriptor list of one month from either buildDayColumns(pm) (4 months) or one month's list. */
const monthCalendar = (calendar, monthIdx) => {
  if (!Array.isArray(calendar) || !calendar.length) return null;
  return Array.isArray(calendar[0]) ? calendar[monthIdx] || null : calendar;
};
const dayExists = (cal, day) => (cal ? cal[day - 1]?.exists !== false : true);
const isSunday = (cal, day) => Boolean(cal && cal[day - 1]?.isWeekend);

// ---------- day reconciliation ----------
const targetDay = (days, cal) => {
  for (let i = 30; i >= 0; i--) if (days[i] > 0 && dayExists(cal, i + 1)) return i;
  if (cal) for (let i = 30; i >= 0; i--) if (dayExists(cal, i + 1) && !isSunday(cal, i + 1)) return i;
  return 27; // day 28 exists in every month
};

const walkBack = (days, amount) => {
  let left = amount;
  for (let i = 30; i >= 0 && left > 0; i--) {
    const take = Math.min(days[i], left);
    days[i] -= take;
    left -= take;
  }
  return days;
};

const shift = (days, delta, cal) => {
  if (delta > 0) days[targetDay(days, cal)] += delta;
  else if (delta < 0) walkBack(days, -delta);
  return days;
};

/**
 * New 31 day values of month `monthIdx` so that they sum to `newTotal`.
 * strategy: 'lastWorkingDay' | 'proportional' | 'none' (days untouched).
 */
export const reconcileDays = (row, monthIdx, newTotal, strategy = DEFAULT_STRATEGY, calendar) => {
  const days = dayValues(row, monthIdx);
  const cal = monthCalendar(calendar, monthIdx);
  const current = sumArray(days);
  if (strategy === 'none' || newTotal === current) return days;
  if (strategy === 'proportional' && current > 0) {
    const factor = newTotal / current;
    const scaled = days.map((v) => (v > 0 ? Math.round(v * factor) : 0));
    return shift(scaled, newTotal - sumArray(scaled), cal);
  }
  return shift(days, newTotal - current, cal);
};

/** Days of a row whose sum differs from the month total (what QA rule R01 will report). */
export const dayMismatches = (row) =>
  MONTH_KEYS.map((k, m) => {
    const dayTotal = sumArray(dayValues(row, m));
    return dayTotal === num(row[k]) ? null : {
      code: 'R01', monthIdx: m, label: MONTH_LABELS[m], dayTotal, total: num(row[k]),
      message: `ผลรวมรายวัน (${dayTotal}) ไม่เท่ากับยอดรวม ${MONTH_LABELS[m]} (${num(row[k])})`,
    };
  }).filter(Boolean);

// ---------- row bookkeeping ----------
const snapshot = (row) => ({ n: row.n, n1: row.n1, n2: row.n2, n3: row.n3, rawRow: [...(row.rawRow || [])] });

const diffCells = (rawRow, original) => {
  const out = [];
  const len = Math.max(rawRow.length, original.length);
  for (let i = 0; i < len; i++) if (num(rawRow[i]) !== num(original[i])) out.push(i);
  return out;
};

/** Finishes an edited copy: recomputes editedCells; a row identical to its original becomes unedited again. */
const finalize = (row) => {
  const editedCells = diffCells(row.rawRow, row.original.rawRow);
  const changedTotal = MONTH_KEYS.some((k) => row[k] !== row.original[k]);
  if (!editedCells.length && !changedTotal) return revertRow(row);
  return { ...row, edited: true, editedCells };
};

/** Restores n..n3, rawRow and day cells from row.original. */
export const revertRow = (row) => {
  if (!row?.original) return row;
  const { original, edited, editedCells, ...rest } = row; // eslint-disable-line no-unused-vars
  return { ...rest, n: original.n, n1: original.n1, n2: original.n2, n3: original.n3, rawRow: [...original.rawRow] };
};

const fail = (row, error, extra = {}) => ({ row, changes: [], cells: [], findings: [], error, ...extra });

let seq = 0;
const newId = (at) => `me-${Date.parse(at) || Date.now()}-${++seq}`;

/**
 * applyRowEdit(row, { n, n1, n2, n3 }, { strategy, reason, at, calendar })
 * -> { row, changes:['N: 1352 → 1300'], cells:[{field,label,before,after}], dayChanges, findings, error?, unchanged? }
 * Invalid input (not an integer >= 0) returns { error } and the same row.
 */
export const applyRowEdit = (row, patch = {}, { strategy = DEFAULT_STRATEGY, calendar } = {}) => {
  if (!STRATEGIES[strategy]) return fail(row, 'วิธีปรับวันไม่ถูกต้อง');
  const wanted = [];
  for (let m = 0; m < MONTH_KEYS.length; m++) {
    const k = MONTH_KEYS[m];
    if (patch[k] === undefined || patch[k] === null || patch[k] === '') continue;
    const value = parseIntStrict(patch[k]);
    if (value === null) return fail(row, INT_ERROR, { field: k });
    if (value !== num(row[k])) wanted.push({ m, k, value });
  }
  if (!wanted.length) return fail(row, null, { unchanged: true });

  const next = { ...row, rawRow: [...(row.rawRow || [])] };
  next.original = row.original || snapshot(row);
  const cells = [];
  const dayChanges = [];
  wanted.forEach(({ m, k, value }) => {
    const before = num(row[k]);
    const days = reconcileDays(next, m, value, strategy, calendar);
    const start = monthTotalCol(row, m) - 31;
    days.forEach((d, i) => {
      if (d !== num(next.rawRow[start + i])) {
        dayChanges.push({ month: MONTH_LABELS[m], day: i + 1, before: num(next.rawRow[start + i]), after: d });
        next.rawRow[start + i] = d;
      }
    });
    next[k] = value;
    next.rawRow[monthTotalCol(row, m)] = value;
    cells.push({ field: k, label: MONTH_LABELS[m], before, after: value });
  });
  const out = finalize(next);
  return {
    row: out,
    changes: cells.map((c) => `${c.label}: ${c.before} → ${c.after}`),
    cells,
    dayChanges,
    findings: strategy === 'none' ? dayMismatches(out) : [],
    error: null,
  };
};

/**
 * Moves `qty` pieces from one day to another inside one month; the month total stays the same.
 * Returns { error } (same row) when refused; { needsConfirm: true, error } when the target is not a working day
 * (a Sunday per `calendar`, or a day with no quantity) and `confirmNonWorking` is not set.
 */
export const applyDayMove = (row, monthIdx, fromDay, toDay, qty, { calendar, confirmNonWorking = false } = {}) => {
  const cal = monthCalendar(calendar, monthIdx);
  const from = parseIntStrict(fromDay);
  const to = parseIntStrict(toDay);
  const q = parseIntStrict(qty);
  if (!(monthIdx >= 0 && monthIdx <= 3)) return fail(row, 'เดือนไม่ถูกต้อง');
  if (from === null || to === null || from < 1 || from > 31 || to < 1 || to > 31) return fail(row, 'วันที่ต้องเป็นเลข 1–31');
  if (!dayExists(cal, from)) return fail(row, `เดือนนี้ไม่มีวันที่ ${from}`);
  if (!dayExists(cal, to)) return fail(row, `เดือนนี้ไม่มีวันที่ ${to}`);
  if (from === to) return fail(row, 'วันต้นทางและปลายทางต้องไม่ใช่วันเดียวกัน');
  if (q === null || q < 1) return fail(row, 'จำนวนที่ย้ายต้องเป็นจำนวนเต็มตั้งแต่ 1');
  const days = dayValues(row, monthIdx);
  if (q > days[from - 1]) return fail(row, `วันที่ ${from} มีเพียง ${days[from - 1]} ชิ้น`);
  if (!confirmNonWorking && (isSunday(cal, to) || days[to - 1] === 0)) {
    return fail(row, `วันที่ ${to} ไม่ใช่วันทำงาน (ยอดเดิม ${days[to - 1]}) กรุณายืนยันก่อนย้าย`, { needsConfirm: true });
  }
  const next = { ...row, rawRow: [...(row.rawRow || [])] };
  next.original = row.original || snapshot(row);
  const start = monthTotalCol(row, monthIdx) - 31;
  next.rawRow[start + from - 1] = days[from - 1] - q;
  next.rawRow[start + to - 1] = days[to - 1] + q;
  const cells = [
    { field: `d${from}`, label: `${MONTH_LABELS[monthIdx]} วันที่ ${from}`, before: days[from - 1], after: days[from - 1] - q },
    { field: `d${to}`, label: `${MONTH_LABELS[monthIdx]} วันที่ ${to}`, before: days[to - 1], after: days[to - 1] + q },
  ];
  return {
    row: finalize(next),
    changes: [`ย้าย ${q} ชิ้น ${MONTH_LABELS[monthIdx]} วันที่ ${from} → ${to} (${days[from - 1]}→${days[from - 1] - q}, ${days[to - 1]}→${days[to - 1] + q})`],
    cells,
    dayChanges: [],
    findings: [],
    error: null,
  };
};

// ---------- ledger ----------
// a day move is ONE ledger cell: "N ย้าย 14 → 16" with both days' before/after
const moveCell = (item, [from, to]) => ({
  field: 'move',
  label: `${MONTH_LABELS[item.monthIdx]} ย้ายยอดวันที่ ${item.fromDay} → ${item.toDay} (${item.qty} ชิ้น)`,
  before: `${from.before} / ${to.before}`,
  after: `${from.after} / ${to.after}`,
});

const buildEntry = (row, plant, item, res, at) => ({
  id: newId(at),
  key: editKey(row, plant),
  plant,
  partNumber: row.partNumber,
  dockCode: row.dockCode ?? '',
  kind: item.kind === 'dayMove' ? 'dayMove' : 'total',
  patch: item.kind === 'dayMove' ? undefined : { ...item.patch },
  move: item.kind === 'dayMove' ? { monthIdx: item.monthIdx, fromDay: item.fromDay, toDay: item.toDay, qty: item.qty, confirmNonWorking: Boolean(item.confirmNonWorking) } : undefined,
  strategy: item.kind === 'dayMove' ? 'none' : item.strategy || DEFAULT_STRATEGY,
  reason: String(item.reason || '').slice(0, REASON_MAX),
  at,
  cells: item.kind === 'dayMove' ? [moveCell(item, res.cells)] : res.cells,
});

/**
 * Applies a list of edits to processedData without mutating it.
 * item: { sheet, rowId, kind?: 'total'|'dayMove'|'revert', patch, strategy, reason, at,
 *         monthIdx, fromDay, toDay, qty, confirmNonWorking }
 * -> { processedData, results:[{ item, ok, error, row, plant, changes, cells, findings, entry, reverted, key }], applied }
 */
export const applyBatch = (processedData, items, { calendar, now = () => new Date().toISOString() } = {}) => {
  const next = { ...processedData };
  const copied = new Set();
  const indexes = new Map();
  const locate = (sheet, rowId) => {
    if (!next[sheet]) return -1;
    if (!indexes.has(sheet)) indexes.set(sheet, new Map(next[sheet].map((r, i) => [r.id, i])));
    return indexes.get(sheet).get(rowId) ?? -1;
  };
  let applied = 0;
  const results = (items || []).map((item) => {
    const idx = locate(item.sheet, item.rowId);
    if (idx === -1) return { item, ok: false, error: 'ไม่พบแถวที่ต้องการแก้ไข', changes: [], cells: [], findings: [] };
    const plant = plantOfSheet(item.sheet);
    const before = next[item.sheet][idx];
    const at = item.at || now();
    let res;
    if (item.kind === 'revert') {
      if (!before.original) return { item, ok: false, error: 'แถวนี้ยังไม่ได้แก้ไข', changes: [], cells: [], findings: [] };
      res = { row: revertRow(before), changes: ['คืนค่าเดิม'], cells: [], findings: [], error: null };
    } else if (item.kind === 'dayMove') {
      res = applyDayMove(before, item.monthIdx, item.fromDay, item.toDay, item.qty, { calendar: item.calendar || calendar, confirmNonWorking: item.confirmNonWorking });
    } else {
      res = applyRowEdit(before, item.patch || {}, { strategy: item.strategy, calendar: item.calendar || calendar });
    }
    if (res.error || res.unchanged) {
      return { item, ok: false, unchanged: Boolean(res.unchanged), needsConfirm: res.needsConfirm, error: res.error || 'ค่าไม่เปลี่ยน', changes: [], cells: [], findings: [], row: before };
    }
    if (!copied.has(item.sheet)) { next[item.sheet] = [...next[item.sheet]]; copied.add(item.sheet); }
    next[item.sheet][idx] = res.row;
    applied++;
    const key = editKey(before, plant);
    return {
      item, ok: true, error: null, row: res.row, plant, key, changes: res.changes, cells: res.cells, findings: res.findings,
      reverted: item.kind === 'revert',
      entry: item.kind === 'revert' ? null : buildEntry(before, plant, item, res, at),
    };
  });
  return { processedData: next, results, applied };
};

const detailsOf = (r) => {
  const it = r.item;
  const how = it.kind === 'dayMove' || it.kind === 'revert' || !it.strategy || it.strategy === DEFAULT_STRATEGY ? '' : ` [${STRATEGIES[it.strategy]}]`;
  return `${r.changes.join(', ')}${how}${it.reason ? ` (${it.reason})` : ''}`;
};

/**
 * applyBatch + the summary rebuild + changelog entries for a whole batch.
 * `buildSummary` is injected (called once per batch).
 */
export const planBatchCommit = (processedData, items, { buildSummary, calendar, now } = {}) => {
  const out = applyBatch(processedData, items, { calendar, now });
  if (!out.applied) return { ...out, summary: null, matching: null, logs: [] };
  const { summary, matching } = buildSummary(out.processedData);
  const logs = out.results.filter((r) => r.ok).map((r) => ({
    fileName: r.row.fileName, plant: r.plant, partNumber: r.row.partNumber, action: 'edit', details: detailsOf(r),
  }));
  return { ...out, summary, matching, logs };
};

/** New ledger after a batch: entries are added, a revert drops every entry of its key, unedited rows lose their entries. */
export const mergeLedger = (ledger, results) => {
  let list = [...(ledger || [])];
  (results || []).filter((r) => r.ok).forEach((r) => {
    if (r.reverted || !r.row?.edited) list = list.filter((e) => e.key !== r.key);
    if (r.entry && r.row?.edited) list.push(r.entry);
  });
  return list;
};

/** Number of rows currently edited. */
export const countEditedRows = (processedData) =>
  Object.values(processedData || {}).reduce((n, rows) => n + rows.reduce((m, r) => m + (r.edited ? 1 : 0), 0), 0);

const entryToItem = (entry, sheet, rowId) => ({
  sheet, rowId, at: entry.at, reason: entry.reason, strategy: entry.strategy,
  ...(entry.kind === 'dayMove' ? { kind: 'dayMove', ...entry.move } : { kind: 'total', patch: entry.patch }),
});

/**
 * Re-applies a ledger on freshly processed data (matching rows by editKey).
 * -> { processedData, applied:[entry], orphans:[entry], unchanged:[entry], failed:[{entry,error}], ledger, results }
 * `ledger` is the new ledger (applied entries refreshed, orphans kept so they return when the file is added again).
 */
export const replayEdits = (processedData, ledger, { calendar } = {}) => {
  const byKey = new Map();
  Object.entries(processedData || {}).forEach(([sheet, rows]) => {
    rows.forEach((r) => {
      const k = editKey(r, plantOfSheet(sheet));
      if (!byKey.has(k)) byKey.set(k, { sheet, id: r.id });
    });
  });
  const orphans = [];
  const jobs = [];
  (ledger || []).forEach((entry) => {
    const hit = byKey.get(entry.key);
    if (!hit) orphans.push(entry);
    else jobs.push({ entry, item: entryToItem(entry, hit.sheet, hit.id) });
  });
  const out = applyBatch(processedData, jobs.map((j) => j.item), { calendar });
  const applied = [];
  const unchanged = [];
  const failed = [];
  out.results.forEach((r, i) => {
    const entry = jobs[i].entry;
    if (r.ok) applied.push({ ...r.entry, id: entry.id });
    else if (r.unchanged) unchanged.push(entry);
    else failed.push({ entry, error: r.error });
  });
  const keep = new Set([...applied, ...orphans].map((e) => e.id));
  const appliedById = new Map(applied.map((e) => [e.id, e]));
  const newLedger = (ledger || []).filter((e) => keep.has(e.id)).map((e) => appliedById.get(e.id) || e);
  return { processedData: out.processedData, applied, orphans, unchanged, failed, ledger: newLedger, results: out.results };
};

// ---------- export ----------
export const LEDGER_HEADER = ['เวลา', 'โรงงาน', 'Part', 'Dock', 'ช่อง', 'ก่อน', 'หลัง', 'วิธีปรับวัน', 'เหตุผล'];

/** Rows of the 'Manual Edits' sheet: one row per edited cell (total or day) of every ledger entry. */
export const buildLedgerAoa = (ledger) => {
  const rows = [];
  (ledger || []).forEach((e) => {
    (e.cells?.length ? e.cells : [{ label: '', before: '', after: '' }]).forEach((c) => {
      rows.push([
        formatDate(e.at, 'long'), e.plant, sanitizeCellText(e.partNumber), sanitizeCellText(e.dockCode), c.label,
        c.before, c.after, STRATEGIES[e.strategy] || '', sanitizeCellText(e.reason),
      ]);
    });
  });
  return [LEDGER_HEADER, ...rows];
};
