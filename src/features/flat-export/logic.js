// ==================== FLAT EXPORT (pure, no DOM) ====================
import { DEFAULT_N_COLS, MONTH_HEADERS, MONTH_KEYS, PLANTS, dailySheetName } from '../../constants.js';
import { monthKey } from '../../utils/format.js';
import pkg from '../../../package.json' with { type: 'json' };

export const SCHEMA_VERSION = 1;
export const APP_VERSION = pkg.version;
export const LONG_COLUMNS = [
  'plant', 'plant_code', 'file_name', 'revision', 'part_number', 'base_part', 'part_code', 'part_desc',
  'supp_code', 'shipping_dock', 'dock_code', 'car_family', 'packing_size', 'month_offset', 'month',
  'horizon', 'day', 'qty', 'edited', 'carried_over', 'spilled',
];
export const SUMMARY_COLUMNS = ['part_number', 'plants', 'n', 'n1', 'n2', 'n3', 'total', 'month_n', 'month_n1', 'month_n2', 'month_n3'];

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const flag = (v) => (v ? 1 : 0);
/** Blank source cell -> '' (never 0). A real 0 stays 0. */
const cellQty = (v) => {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};

export const basePart = (pn) => text(pn).replace(/-\d{2}$/, '');
const totalCol = (row, i) => {
  const c = row?.colPositions?.[`${MONTH_KEYS[i]}Col`];
  return Number.isInteger(c) ? c : DEFAULT_N_COLS[i];
};
/** 31 day cells of month `i`: numbers, or '' for blank cells (short rows tolerated). */
export const dayCells = (row, i) => {
  const end = totalCol(row, i);
  const raw = Array.isArray(row?.rawRow) ? row.rawRow : [];
  return Array.from({ length: 31 }, (_, d) => cellQty(raw[end - 31 + d]));
};

const rowsOf = (processedData) =>
  PLANTS.flatMap((plant) => (processedData?.[dailySheetName(plant)] || []).map((row) => ({ plant, row })));
const metaOf = (files, fileName) => files?.find((f) => f.name === fileName)?.meta || {};

/** One record per plant x part row x month offset (0..3) x (day 1..31 | 'TOTAL'). Object records keyed by LONG_COLUMNS. */
export const buildLongRows = (processedData, productionMonth, { files = [] } = {}) => {
  const out = [];
  rowsOf(processedData).forEach(({ plant, row }) => {
    const meta = metaOf(files, row.fileName);
    const base = {
      plant,
      plant_code: text(meta.plantCode),
      file_name: text(row.fileName),
      revision: text(meta.revision),
      part_number: text(row.partNumber),
      base_part: basePart(row.partNumber),
      part_code: text(row.partCode),
      part_desc: text(row.partDesc),
      supp_code: text(row.suppCode),
      shipping_dock: text(row.shippingDock),
      dock_code: text(row.dockCode),
      car_family: text(row.carFamily),
      packing_size: row.packingSize ?? '',
    };
    const flags = { edited: flag(row.edited), carried_over: flag(row.carriedOver), spilled: flag(row.spilled) };
    for (let i = 0; i < 4; i++) {
      const head = { ...base, month_offset: i, month: monthKey(productionMonth, i), horizon: MONTH_HEADERS[i] };
      const days = dayCells(row, i);
      days.forEach((qty, d) => out.push({ ...head, day: d + 1, qty, ...flags }));
      out.push({ ...head, day: 'TOTAL', qty: cellQty(row[MONTH_KEYS[i]]), ...flags });
    }
  });
  return out;
};

export const recordsToAoa = (records, columns = LONG_COLUMNS) => [columns, ...records.map((r) => columns.map((c) => r[c] ?? ''))];

/** Wide summary: a single header line, month columns carry YYYY-MM as data. */
export const buildSummaryRows = (summaryData, productionMonth) => {
  const months = [0, 1, 2, 3].map((i) => monthKey(productionMonth, i));
  return [SUMMARY_COLUMNS, ...(summaryData || []).map((r) => [
    r.partNumber, String(r.plants ?? '').split(/\s*,\s*/).filter(Boolean).join('|'),
    r.n, r.n1, r.n2, r.n3, r.n + r.n1 + r.n2 + r.n3, ...months,
  ])];
};

export const productionMonthInfo = (state) => {
  const pm = state.productionMonth;
  if (!pm) return null;
  const raw = state.sourceFiles?.find((f) => f.meta?.productionMonthRaw)?.meta.productionMonthRaw
    || `${pm.year}${String(pm.month).padStart(2, '0')}`;
  return { raw, year: pm.year, month: pm.month };
};
/** Month token for file names ("202602"); "unknown" when the files carry no PRODUCTION MONTH. */
export const monthToken = (state) => productionMonthInfo(state)?.raw || 'unknown';

/** Everything the JSON export needs; `now` is injectable. qa / manifestSha256 only appear when those features provide them. */
export const buildJsonExport = (state, { now = () => new Date(), qa, manifestSha256 } = {}) => {
  const files = state.sourceFiles || [];
  const entries = rowsOf(state.processedData);
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    generatedAt: now().toISOString(),
    productionMonth: productionMonthInfo(state),
    monthLabels: state.monthLabels || [],
    files: files.filter((f) => f.status !== 'error').map((f) => ({
      name: f.name,
      plant: f.category,
      plantCode: text(f.meta?.plantCode),
      revision: text(f.meta?.revision),
      forecastType: text(f.meta?.forecastType),
      issueDate: text(f.meta?.issueDate),
      size: f.size ?? 0,
      sha256: f.sha256 ?? null,
      rows: entries.filter((e) => e.row.fileName === f.name).length,
    })),
    rows: entries.map(({ plant, row }) => ({
      plant,
      fileName: text(row.fileName),
      partNumber: text(row.partNumber),
      basePart: basePart(row.partNumber),
      partCode: text(row.partCode),
      dockCode: text(row.dockCode),
      packingSize: row.packingSize ?? null,
      n: row.n, n1: row.n1, n2: row.n2, n3: row.n3,
      daily: [0, 1, 2, 3].map((i) => dayCells(row, i).map((v) => (v === '' ? null : v))),
      edited: !!row.edited,
      carriedOver: !!row.carriedOver,
      spilled: !!row.spilled,
    })),
    summary: (state.summaryData || []).map((r) => ({
      partNumber: r.partNumber,
      plants: String(r.plants ?? '').split(/\s*,\s*/).filter(Boolean),
      n: r.n, n1: r.n1, n2: r.n2, n3: r.n3,
      total: r.n + r.n1 + r.n2 + r.n3,
    })),
  };
  if (qa !== undefined) doc.qa = qa;
  if (manifestSha256) doc.manifestSha256 = manifestSha256;
  return doc;
};
