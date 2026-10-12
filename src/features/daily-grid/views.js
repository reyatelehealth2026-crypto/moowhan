// ==================== DAILY GRID VIEW LOGIC (pure) ====================
import { PLANTS } from '../../constants.js';
import { toTsv } from '../../utils/serialize.js';
import { buildDayColumns } from '../../utils/calendar.js';
import { plantItems, sumByPartDay, sumArray, totalsByDock } from '../../lib/excel/daily.js';

export const PRESETS = [
  { id: 'total', label: 'ยอดรวมรายเดือน' },
  { id: 'm0', label: 'รายวัน เดือน N', monthIdx: 0 },
  { id: 'm1', label: 'รายวัน เดือน N+1', monthIdx: 1 },
  { id: 'm2', label: 'รายวัน เดือน N+2', monthIdx: 2 },
  { id: 'm3', label: 'รายวัน เดือน N+3', monthIdx: 3 },
  { id: 'all', label: 'รายวันทั้ง 4 เดือน' },
];
export const VIEW_MODES = [
  { id: 'plant', label: 'ต่อโรงงาน' },
  { id: 'merged', label: 'รวมทุกโรงงาน' },
  { id: 'dock', label: 'โหลดตาม Dock' },
];
export const DEFAULT_SETTINGS = { preset: 'total', view: 'plant', plant: 'BP', capacity: '', includeInExport: false };
const STORAGE_KEY = 'moowhan.daily-grid.v1';

const getStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

/** Settings fall back to the defaults when storage is missing, throws or holds garbage. */
export const loadSettings = (storage = getStorage()) => {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
    const out = { ...DEFAULT_SETTINGS };
    if (PRESETS.some((p) => p.id === parsed.preset)) out.preset = parsed.preset;
    if (VIEW_MODES.some((v) => v.id === parsed.view)) out.view = parsed.view;
    if (PLANTS.includes(parsed.plant)) out.plant = parsed.plant;
    if (parsed.capacity !== undefined && parsed.capacity !== null && Number.isFinite(Number(parsed.capacity))) out.capacity = String(parsed.capacity);
    out.includeInExport = parsed.includeInExport === true;
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};
export const saveSettings = (settings, storage = getStorage()) => {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); return true; } catch { return false; }
};

/** Numeric columns of a preset: { key, monthIdx, kind: 'day'|'total', day?, weekday, exists, isWeekend }. */
export const buildColumns = (presetId, pm) => {
  const dayCols = buildDayColumns(pm);
  const month = (m) => [
    ...dayCols[m].map((d) => ({ key: `${m}-${d.day}`, monthIdx: m, kind: 'day', ...d })),
    { key: `${m}-t`, monthIdx: m, kind: 'total', exists: true, isWeekend: false, weekday: null },
  ];
  if (presetId === 'all') return [0, 1, 2, 3].flatMap(month);
  const p = PRESETS.find((x) => x.id === presetId);
  if (p && p.monthIdx !== undefined) return month(p.monthIdx);
  return [0, 1, 2, 3].map((m) => ({ key: `${m}-t`, monthIdx: m, kind: 'total', exists: true, isWeekend: false, weekday: null }));
};

const withMonths = (build) => [0, 1, 2, 3].map(build);
const fromMonths = (base, perMonth) => ({ ...base, days: perMonth.map((x) => x.days), totals: perMonth.map((x) => x.total) });

/**
 * Grid items for a view. Item: { type: 'row'|'group', key, partNumber, partDesc, plant, dock, days: [4][31], totals: [4] }.
 * `plant` view -> rows of one plant; `merged` -> one row per part; `dock` -> dock group rows followed by their parts.
 */
export const buildGridItems = (processedData, { view = 'plant', plant = 'BP', search = '' } = {}) => {
  const q = String(search).trim().toLowerCase();
  const match = (it) => !q || `${it.partNumber} ${it.partDesc ?? ''} ${it.partCode ?? ''}`.toLowerCase().includes(q);
  if (view === 'merged') {
    const per = withMonths((m) => sumByPartDay(processedData, m));
    return per[0].map((p, i) => fromMonths({ type: 'row', key: p.partNumber, partNumber: p.partNumber, partDesc: p.partDesc, partCode: p.partCode, plant: p.plants.join(','), dock: p.docks.join(',') }, per.map((l) => l[i]))).filter(match);
  }
  if (view === 'dock') {
    const per = withMonths((m) => totalsByDock(processedData, m));
    const out = [];
    PLANTS.forEach((pl, pi) => {
      if (plant !== 'ALL' && pl !== plant) return;
      per[0][pi].docks.forEach((d, di) => {
        const parts = d.parts.map((it, k) => fromMonths({ type: 'row', key: `${pl}|${d.dock}|${it.partNumber}|${k}`, partNumber: it.partNumber, partDesc: it.partDesc, partCode: it.partCode, plant: pl, dock: d.dock }, per.map((l) => l[pi].docks[di].parts[k]))).filter(match);
        if (!parts.length) return;
        const days = [0, 1, 2, 3].map(() => new Array(31).fill(0));
        parts.forEach((p) => p.days.forEach((arr, m) => arr.forEach((v, i) => { days[m][i] += v; })));
        out.push({ type: 'group', key: `${pl}|${d.dock}`, partNumber: `${pl} · Dock ${d.dock}`, partDesc: `${parts.length} รายการ`, plant: pl, dock: d.dock, days, totals: days.map(sumArray) }, ...parts);
      });
    });
    return out;
  }
  const per = withMonths((m) => plantItems(processedData, plant, m));
  return per[0].map((it, i) => fromMonths({ type: 'row', key: `${plant}|${it.rowId ?? i}`, partNumber: it.partNumber, partDesc: it.partDesc, partCode: it.partCode, plant, dock: it.dock }, per.map((l) => l[i]))).filter(match);
};

/** Footer: sum of the data rows only (group rows are subtotals and are skipped). */
export const sumItems = (items) => {
  const days = [0, 1, 2, 3].map(() => new Array(31).fill(0));
  items.filter((i) => i.type === 'row').forEach((it) => it.days.forEach((arr, m) => arr.forEach((v, d) => { days[m][d] += v; })));
  return { days, totals: days.map(sumArray) };
};

export const cellValue = (item, col) => (col.kind === 'total' ? item.totals[col.monthIdx] : item.days[col.monthIdx][col.day - 1]);

/** Capacity applies per row, or per dock group in the Dock view (group rows are the load). */
export const capacityTargets = (items, view) => items.filter((i) => (view === 'dock' ? i.type === 'group' : i.type === 'row'));
export const isOver = (value, capacity) => capacity > 0 && value > capacity;
/** Days (month index + day) where at least one capacity target exceeds the capacity. */
export const overDays = (items, view, capacity, monthIdxs = [0, 1, 2, 3]) => {
  const cap = Number(capacity);
  if (!(cap > 0)) return 0;
  const set = new Set();
  capacityTargets(items, view).forEach((it) => monthIdxs.forEach((m) => it.days[m].forEach((v, d) => { if (v > cap) set.add(`${m}-${d}`); })));
  return set.size;
};

/** Per-plant KPI of one month: shipping days (a day with any quantity), average per shipping day, peak day. */
export const plantKpis = (processedData, monthIdx) =>
  totalsByDock(processedData, monthIdx).map(({ plant, days, total }) => {
    const shipping = days.filter((v) => v > 0).length;
    let peakDay = 0;
    let peak = 0;
    days.forEach((v, i) => { if (v > peak) { peak = v; peakDay = i + 1; } });
    return { plant, total, shippingDays: shipping, average: shipping ? Math.round(total / shipping) : 0, peak, peakDay };
  });

// ---------- clipboard (TSV) ----------
/** One cell as TSV text (formula-safe). */
export const tsvCell = (v) => toTsv([[v]]);
export { toTsv };

export const gridToAoa = (items, columns, labels = ['N', 'N+1', 'N+2', 'N+3']) => {
  const head = ['Part Number', 'Plant', 'Dock', ...columns.map((c) => `${labels[c.monthIdx]} ${c.kind === 'total' ? 'รวม' : c.day}`)];
  const body = items.map((it) => [it.partNumber, it.plant, it.dock, ...columns.map((c) => cellValue(it, c))]);
  const foot = sumItems(items);
  return [head, ...body, ['รวม', '', '', ...columns.map((c) => (c.kind === 'total' ? foot.totals[c.monthIdx] : foot.days[c.monthIdx][c.day - 1]))]];
};

/** Quantity-free days of a plant for the "ไม่มีการส่ง" caption. */
export const noDeliveryDays = (days, existsFlags) => days.reduce((n, v, i) => n + (existsFlags[i] && v === 0 ? 1 : 0), 0);
