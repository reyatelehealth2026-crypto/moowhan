// ==================== BOXES / PALLETS / PACKING TYPE (pure, no DOM) ====================
import { MONTH_KEYS } from '../../constants.js';
import { getColumnIndex } from '../../utils/format.js';
import { basePartNumber } from './logic.js';

const str = (v) => String(v ?? '').trim();

/** ceil(pieces / size); null when size is not a positive integer. Never throws. */
export const toBoxes = (pieces, size) => {
  const s = typeof size === 'string' ? (size.trim() === '' ? NaN : Number(size)) : size;
  if (!Number.isInteger(s) || s <= 0) return null;
  const p = Number(pieces);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.ceil(p / s);
};

export const isExactMultiple = (pieces, size) => {
  const b = toBoxes(pieces, size);
  if (b === null) return true; // nothing to judge
  return (Number(pieces) || 0) % Number(size) === 0;
};

export const palletKey = (plant, basePart, dock) => `${plant}|${basePart}|${str(dock)}`;
export const typeKey = (basePart, plant, dock) => `${basePart}|${plant}|${str(dock)}`;

/** Packing type resolution: master override > template map (exact) > majority per (plant, dock, inferred). */
export const packingTypeFor = (map, master, { basePart, plant, dock }) => {
  const override = master?.docks?.[`${plant}|${str(dock)}`]?.packingType;
  if (override) return { type: override, inferred: false };
  const exact = map?.get(typeKey(basePart, plant, dock));
  if (exact) return { type: exact, inferred: false };
  const counts = new Map();
  (map ? [...map.entries()] : []).forEach(([k, t]) => {
    const [, p, d] = k.split('|');
    if (p === plant && d === str(dock)) counts.set(t, (counts.get(t) || 0) + 1);
  });
  let best = '';
  let bc = 0;
  counts.forEach((c, t) => { if (c > bc) { best = t; bc = c; } });
  return { type: best, inferred: !!best };
};

/** Analyze!EN:ER block (part, plant, dock, key, type) -> Map(base|plant|dock -> type) from an array-of-arrays. */
export const packingMapFromAoa = (aoa) => {
  const c = ['EN', 'EO', 'EP', 'ER'].map(getColumnIndex).map((i) => i - 1);
  const map = new Map();
  (aoa || []).forEach((row) => {
    const part = str(row?.[c[0]]);
    const plant = str(row?.[c[1]]);
    const dock = str(row?.[c[2]]);
    const type = str(row?.[c[3]]);
    if (part.length < 5 || !plant || !dock || !type) return;
    map.set(typeKey(basePartNumber(part), plant, dock), type);
  });
  return map;
};

/** Reads the packing type map from the template (lazy xlsx via the barrel). Empty map when unreadable. */
export const readPackingTypeMap = async (templateBuffer) => {
  try {
    const excel = await import('../../lib/excel/index.js');
    const { rawSheets } = excel.workbookToRawSheets(templateBuffer);
    return packingMapFromAoa(rawSheets.Analyze);
  } catch {
    return new Map();
  }
};

const emptyMonths = () => ({ n: null, n1: null, n2: null, n3: null });

/** One entry per source row with boxes / pallets per month (null = unknown) and exactness. */
export const buildBoxRows = (rows, master, map) =>
  (rows || []).map((row) => {
    const basePart = basePartNumber(row.partNumber);
    const dock = str(row.dockCode);
    const size = row.packingSize;
    const boxes = emptyMonths();
    const pallets = emptyMonths();
    const bpp = master?.pallets?.[palletKey(row.plant, basePart, dock)] ?? null;
    MONTH_KEYS.forEach((k) => {
      boxes[k] = toBoxes(row[k], size);
      pallets[k] = bpp && boxes[k] !== null ? Math.ceil(boxes[k] / bpp) : null;
    });
    const valid = toBoxes(1, size) !== null;
    const exact = isExactMultiple(row.n, size); // judged on month N only
    const { type, inferred } = packingTypeFor(map, master, { basePart, plant: row.plant, dock });
    return { row, partNumber: row.partNumber, plant: row.plant, basePart, dock, size: valid ? Number(size) : null, boxes, pallets, exact, packingType: type, inferred, boxesPerPallet: bpp };
  });

export const sumNullable = (list, k) => list.reduce((s, x) => (x[k] === null ? s : (s === null ? 0 : s) + x[k]), null);
