// ==================== DOCK / CAR FAMILY / BASE PART GROUPING (pure, no DOM) ====================
import { MONTH_KEYS, PLANTS, dailySheetName } from '../../constants.js';
import { dayValues } from '../../lib/excel/daily.js';
import { toBoxes } from './packaging.js';

export const NO_CAR_FAMILY = '(ไม่ระบุ)';
export const BASE_LEN = 11;
export const GROUP_BY = ['plant', 'dock', 'carFamily', 'basePart'];

const str = (v) => String(v ?? '').trim();
/** "86790-0K051-00" -> "86790-0K051" (shorter values are returned as-is). */
export const basePartNumber = (pn) => str(pn).slice(0, BASE_LEN);
export const dockKey = (plant, dockCode) => `${plant}|${str(dockCode)}`;

/** Every row of processedData in PLANTS order, with plant guaranteed on the row. */
export const allRows = (processedData, { plants, partType } = {}) => {
  const out = [];
  PLANTS.forEach((plant) => {
    if (plants && plants.length && !plants.includes(plant)) return;
    (processedData?.[dailySheetName(plant)] || []).forEach((r) => {
      if (partType && str(r.partType) !== partType) return;
      out.push(r.plant ? r : { ...r, plant });
    });
  });
  return out;
};

const KEYERS = {
  plant: (r) => ({ key: r.plant, label: r.plant }),
  dock: (r) => ({ key: dockKey(r.plant, r.dockCode), label: str(r.dockCode) || '-' }),
  carFamily: (r) => { const c = str(r.carFamily) || NO_CAR_FAMILY; return { key: c, label: c }; },
  basePart: (r) => { const b = basePartNumber(r.partNumber); return { key: b, label: b }; },
};

const sizeOf = (r) => r.packingSize;

/** Groups rows. Box counts are the sum of per-row ceil (never ceil of the sum). */
export const groupRows = (processedData, { by = 'dock', plants, partType } = {}) => {
  const keyer = KEYERS[by] || KEYERS.dock;
  const map = new Map();
  allRows(processedData, { plants, partType }).forEach((r) => {
    const { key, label } = keyer(r);
    let g = map.get(key);
    if (!g) {
      g = { key, label, by, plant: r.plant, dockCode: str(r.dockCode), shippingDocks: [], carFamily: str(r.carFamily) || NO_CAR_FAMILY, plants: [], parts: 0, n: 0, n1: 0, n2: 0, n3: 0, boxes: { n: 0, n1: 0, n2: 0, n3: 0 }, rows: [] };
      map.set(key, g);
    }
    const sd = str(r.shippingDock);
    if (sd && !g.shippingDocks.includes(sd)) g.shippingDocks.push(sd);
    if (!g.plants.includes(r.plant)) g.plants.push(r.plant);
    g.rows.push(r);
    MONTH_KEYS.forEach((k) => {
      g[k] += Number(r[k]) || 0;
      g.boxes[k] += toBoxes(r[k], sizeOf(r)) ?? 0;
    });
  });
  return [...map.values()].map((g) => ({ ...g, parts: new Set(g.rows.map((r) => r.partNumber)).size }));
};

/** Parts that appear under more than one dock code within a plant. */
export const multiDockParts = (processedData, opts = {}) => {
  const map = new Map();
  allRows(processedData, opts).forEach((r) => {
    const k = `${r.plant}|${r.partNumber}`;
    const e = map.get(k) || { plant: r.plant, partNumber: r.partNumber, dockCodes: [] };
    const d = str(r.dockCode);
    if (d && !e.dockCodes.includes(d)) e.dockCodes.push(d);
    map.set(k, e);
  });
  return [...map.values()].filter((e) => e.dockCodes.length > 1);
};

/** Distinct days with a positive value (union over rows) + the peak day (all rows summed). */
export const deliveryDays = (rows, monthIdx = 0) => {
  const total = new Array(31).fill(0);
  const hit = new Array(31).fill(false);
  (rows || []).forEach((r) => dayValues(r, monthIdx).forEach((v, i) => { total[i] += v; if (v > 0) hit[i] = true; }));
  let peak = 0;
  let peakDay = null;
  total.forEach((v, i) => { if (v > peak) { peak = v; peakDay = i + 1; } });
  return { days: hit.filter(Boolean).length, peak, peakDay };
};

/** Rows with different dock codes or shipping docks in one group are summarised for display. */
export const shippingDockText = (g) => (g.shippingDocks.length ? g.shippingDocks.join(', ') : '-');

export const dockCount = (processedData, opts) => groupRows(processedData, { ...opts, by: 'dock' }).length;
