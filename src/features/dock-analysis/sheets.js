// ==================== OPT-IN EXPORT SHEETS (values only, never touches template cells) ====================
import { MONTH_KEYS } from '../../constants.js';
import { allRows, groupRows, basePartNumber, NO_CAR_FAMILY } from './logic.js';
import { buildBoxRows } from './packaging.js';

export const SHEET_NAMES = { dock: 'By Dock', carFamily: 'By Car Family', boxes: 'Boxes' };
const MONTH_HEAD = ['Sum of N', 'Sum of N+1', 'Sum of N+2', 'Sum of N+3'];
const str = (v) => String(v ?? '').trim();

/** One line per part x plant x dock (rows with the same key are summed). */
export const buildByDockAoa = (processedData) => {
  const map = new Map();
  allRows(processedData).forEach((r) => {
    const k = `${r.partNumber}|${r.plant}|${str(r.dockCode)}`;
    const e = map.get(k) || { partNumber: r.partNumber, plant: r.plant, dock: str(r.dockCode), ship: new Set(), n: 0, n1: 0, n2: 0, n3: 0 };
    if (str(r.shippingDock)) e.ship.add(str(r.shippingDock));
    MONTH_KEYS.forEach((m) => { e[m] += Number(r[m]) || 0; });
    map.set(k, e);
  });
  return [
    ['PART NUMBER', 'PLANT', 'DOCK CODE', 'SHIPPING DOCK', ...MONTH_HEAD],
    ...[...map.values()].map((e) => [e.partNumber, e.plant, e.dock, [...e.ship].join(', '), e.n, e.n1, e.n2, e.n3]),
  ];
};

export const buildByCarFamilyAoa = (processedData) => [
  ['CAR FAMILY', 'PARTS', ...MONTH_HEAD],
  ...groupRows(processedData, { by: 'carFamily' }).map((g) => [g.label === NO_CAR_FAMILY ? g.label : g.key, g.parts, g.n, g.n1, g.n2, g.n3]),
];

export const buildBoxesAoa = (processedData, master, map) => [
  ['PART NUMBER', 'PLANT', 'DOCK CODE', 'PACKING SIZE', 'PACKING TYPE', 'Boxes N', 'Boxes N+1', 'Boxes N+2', 'Boxes N+3', 'Pallets N', 'Pallets N+1', 'Pallets N+2', 'Pallets N+3'],
  ...buildBoxRows(allRows(processedData), master, map).map((b) => [
    b.row.partNumber, b.row.plant, b.dock, b.size ?? '', b.packingType,
    ...MONTH_KEYS.map((k) => b.boxes[k] ?? ''), ...MONTH_KEYS.map((k) => b.pallets[k] ?? ''),
  ]),
];

/** opts = { dock, carFamily, boxes } booleans. Returns [] when nothing is opted in. */
export const buildSheets = (processedData, opts = {}, master, map) => {
  if (!processedData) return [];
  const out = [];
  if (opts.dock) out.push({ name: SHEET_NAMES.dock, aoa: buildByDockAoa(processedData) });
  if (opts.carFamily) out.push({ name: SHEET_NAMES.carFamily, aoa: buildByCarFamilyAoa(processedData) });
  if (opts.boxes) out.push({ name: SHEET_NAMES.boxes, aoa: buildBoxesAoa(processedData, master, map) });
  return out;
};
export { basePartNumber };
