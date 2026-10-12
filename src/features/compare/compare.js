// ==================== COMPARE (pure logic) ====================
// Compares a baseline (previous round) with the current round, aligned by calendar month.
// Rows are plain {plant, part, dock, n, n1, n2, n3}. No DOM/React: runs in Node for tests.
import { MONTH_KEYS, MONTH_HEADERS } from '../../constants.js';
import { formatMonth } from '../../utils/format.js';

export const DEFAULT_THRESHOLD = { pct: 10, minPcs: 50 };
export const STATUS_LABEL = { same: 'เหมือนเดิม', changed: 'เปลี่ยน', new: 'ใหม่', missing: 'หายไป' };
export const COMPARE_SHEET = 'FC Compare';
export const COMPARE_HEADERS = ['Part', 'Plant', 'Dock', 'Month', 'Previous', 'Current', 'Diff', 'Diff%', 'Status'];

const monthIndex = (m) => m.year * 12 + (m.month - 1);
const isMonth = (m) => !!m && Number.isInteger(m.year) && Number.isInteger(m.month) && m.month >= 1 && m.month <= 12;

/** Pairs (prev index p, curr index c) that fall on the same calendar month: p = c + shift. */
export const pairsForShift = (shift) => {
  const pairs = [];
  for (let c = 0; c < 4; c++) {
    const p = c + shift;
    if (p >= 0 && p < 4) pairs.push({ prevIdx: p, currIdx: c, prevKey: MONTH_KEYS[p], currKey: MONTH_KEYS[c] });
  }
  return pairs;
};

/**
 * Align the months of a previous round with the current round by calendar.
 * shift = currMonth - prevMonth (0 => same month, i.e. a revision of the same round).
 * opts.positional (not recommended) pairs N with N, N+1 with N+1 ... regardless of the calendar.
 * @returns {{ shift:number, mode:'revision'|'shift'|'positional'|'none', pairs:Array, warning:string, sentence:string }}
 */
export const alignMonths = (prevMonth, currMonth, { positional = false } = {}) => {
  if (!isMonth(currMonth)) {
    return { shift: 0, mode: 'none', pairs: [], warning: 'ไม่ทราบเดือนของรอบนี้ (ไฟล์ไม่มี PRODUCTION MONTH) เทียบตามปฏิทินไม่ได้', sentence: '' };
  }
  if (positional) {
    const pairs = pairsForShift(0);
    return {
      shift: 0, mode: 'positional', pairs, warning: 'จับคู่ตามลำดับ (N กับ N) โดยไม่ดูปฏิทิน อาจเทียบผิดเดือน ไม่แนะนำ',
      sentence: 'เทียบตามลำดับ N กับ N, N+1 กับ N+1 ... (ไม่ดูปฏิทิน)',
    };
  }
  if (!isMonth(prevMonth)) {
    return { shift: 0, mode: 'none', pairs: [], warning: 'ยังไม่ได้ยืนยันเดือนของรอบก่อน', sentence: '' };
  }
  const shift = monthIndex(currMonth) - monthIndex(prevMonth);
  const pairs = pairsForShift(shift);
  if (!pairs.length) {
    return {
      shift, mode: 'none', pairs,
      warning: `เดือนของรอบก่อน (${formatMonth(prevMonth)}) กับรอบนี้ (${formatMonth(currMonth)}) ไม่ซ้อนกันเลย เทียบไม่ได้ ตรวจสอบเดือนของรอบก่อนอีกครั้ง`,
      sentence: '',
    };
  }
  if (shift === 0) {
    return {
      shift, mode: 'revision', pairs, warning: '',
      sentence: `รอบเดียวกัน (revision): เทียบ ${formatMonth(currMonth, pairs[0].currIdx)} – ${formatMonth(currMonth, pairs[pairs.length - 1].currIdx)} ของ Rev เก่ากับ Rev ใหม่`,
    };
  }
  const first = pairs[0];
  const more = pairs.length > 1 ? ` และอีก ${pairs.length - 1} เดือน` : '';
  return {
    shift, mode: 'shift', pairs, warning: '',
    sentence: `เทียบ ${formatMonth(currMonth, first.currIdx)} (รอบก่อน ${MONTH_HEADERS[first.prevIdx]}) กับ ${formatMonth(currMonth, first.currIdx)} (รอบนี้ ${MONTH_HEADERS[first.currIdx]})${more}`,
  };
};

const keyOf = (r, level) => (level === 'part' ? `${r.plant}|${r.part}` : `${r.plant}|${r.part}|${r.dock ?? ''}`);

const groupRows = (rows, level) => {
  const map = new Map();
  (rows || []).forEach((r) => {
    const k = keyOf(r, level);
    let g = map.get(k);
    if (!g) { g = { key: k, plant: r.plant, part: r.part, dock: level === 'part' ? '' : (r.dock ?? ''), n: 0, n1: 0, n2: 0, n3: 0 }; map.set(k, g); }
    MONTH_KEYS.forEach((m) => { g[m] += Number(r[m]) || 0; });
  });
  return map;
};

/**
 * Compare two row sets. `shift` = currMonth - prevMonth in months (see alignMonths).
 * @returns rows {key, plant, part, dock, month, monthIdx, prev, curr, diff, pct|null, status}
 *   status: same | changed | new (no base) | missing (key gone from the current round)
 */
export const compare = (prevRows, currRows, shift = 0, { level = 'dock', currMonth = null } = {}) => {
  const pairs = pairsForShift(shift);
  if (!pairs.length) return [];
  const prev = groupRows(prevRows, level);
  const curr = groupRows(currRows, level);
  const out = [];
  const monthLabel = (c) => (isMonth(currMonth) ? formatMonth(currMonth, c) : MONTH_HEADERS[c]);
  const push = (g, p, c, pair, status) => {
    const prevV = p ? p[pair.prevKey] : 0;
    const currV = c ? c[pair.currKey] : 0;
    const diff = currV - prevV;
    out.push({
      key: g.key, plant: g.plant, part: g.part, dock: g.dock,
      month: monthLabel(pair.currIdx), monthIdx: pair.currIdx,
      prev: prevV, curr: currV, diff, pct: prevV === 0 ? null : (diff / prevV) * 100,
      status: status || (prevV === 0 && currV > 0 ? 'new' : diff === 0 ? 'same' : 'changed'),
    });
  };
  const keys = new Set([...prev.keys(), ...curr.keys()]);
  keys.forEach((k) => {
    const p = prev.get(k);
    const c = curr.get(k);
    const g = p || c;
    if (p && c) { pairs.forEach((pair) => push(g, p, c, pair)); return; }
    // one-sided key: only months that actually carry volume (or the first pair so the key is not lost)
    const side = p ? 'prevKey' : 'currKey';
    const live = pairs.filter((pair) => (p || c)[pair[side]] > 0);
    (live.length ? live : [pairs[0]]).forEach((pair) => push(g, p, c, pair, p ? 'missing' : 'new'));
  });
  return out;
};

/** Key-level status: missing > new (all rows new) > changed > same. */
const keyStatus = (rows) => {
  if (rows.some((r) => r.status === 'missing')) return 'missing';
  if (rows.every((r) => r.status === 'new')) return 'new';
  if (rows.some((r) => r.status !== 'same')) return 'changed';
  return 'same';
};

/** KPI numbers counted per key (part/dock) so one part is one count, not four. */
export const summarize = (rows, { shift = null } = {}) => {
  const byKey = new Map();
  rows.forEach((r) => { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(r); });
  const s = { keys: byKey.size, same: 0, changed: 0, increased: 0, decreased: 0, new: 0, missing: 0, firmChanged: shift === 1 ? 0 : null, totalPrev: 0, totalCurr: 0, totalDiff: 0 };
  byKey.forEach((list) => {
    const st = keyStatus(list);
    s[st] += 1;
    if (st === 'changed') {
      const net = list.reduce((a, r) => a + r.diff, 0);
      if (net > 0) s.increased += 1; else if (net < 0) s.decreased += 1;
    }
    if (shift === 1 && list.some((r) => r.monthIdx === 0 && r.status !== 'same')) s.firmChanged += 1;
  });
  rows.forEach((r) => { s.totalPrev += r.prev; s.totalCurr += r.curr; s.totalDiff += r.diff; });
  return s;
};

/** Rows that matter: new/missing always, changed only when |pct| >= pct AND |diff| >= minPcs. Sorted by |diff| desc. */
export const filterRows = (rows, { pct = DEFAULT_THRESHOLD.pct, minPcs = DEFAULT_THRESHOLD.minPcs } = {}) =>
  rows
    .filter((r) => r.status === 'new' || r.status === 'missing' || (r.status === 'changed' && r.pct !== null && Math.abs(r.pct) >= pct && Math.abs(r.diff) >= minPcs))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

/** Sheet "FC Compare": header + one array per row. */
export const compareToAoa = (rows) => [
  COMPARE_HEADERS,
  ...rows.map((r) => [r.part, r.plant, r.dock, r.month, r.prev, r.curr, r.diff, r.pct === null ? '' : Math.round(r.pct * 10) / 10, STATUS_LABEL[r.status] || r.status]),
];

/** Current processedData -> baseline-shaped rows. */
export const rowsFromProcessed = (processedData) =>
  Object.entries(processedData || {}).flatMap(([sheet, list]) =>
    (list || []).map((r) => ({
      plant: r.plant || sheet.replace(/ Daily$/, ''),
      part: r.partNumber,
      dock: String(r.dockCode || r.shippingDock || '').trim(),
      n: Number(r.n) || 0, n1: Number(r.n1) || 0, n2: Number(r.n2) || 0, n3: Number(r.n3) || 0,
    })));
