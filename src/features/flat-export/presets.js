// Column presets for the long CSV. A preset is plain data so it can be edited/persisted later (settings-profile hook).
import { LONG_COLUMNS } from './logic.js';

// totalMode: 'all' = days + TOTAL rows | 'only' = TOTAL rows | 'days' = days only (safe for pivots: no double counting)
export const BUILTIN_PRESETS = [
  { id: 'standard', label: 'มาตรฐาน', delimiter: ',', totalMode: 'all', columns: LONG_COLUMNS, rename: {} },
  {
    id: 'odoo', label: 'Odoo', delimiter: ',', totalMode: 'only',
    columns: ['plant', 'part_number', 'part_desc', 'month', 'horizon', 'qty'],
    rename: { plant: 'warehouse', part_number: 'default_code', part_desc: 'name', month: 'date', horizon: 'period', qty: 'product_qty' },
  },
  { id: 'sheets', label: 'Google Sheets', delimiter: ',', totalMode: 'all', columns: LONG_COLUMNS.filter((c) => !['file_name', 'plant_code'].includes(c)), rename: {} },
  {
    id: 'powerquery', label: 'Power Query', delimiter: ',', totalMode: 'days',
    columns: LONG_COLUMNS.filter((c) => !['edited', 'carried_over', 'spilled'].includes(c)), rename: {},
  },
];
export const DEFAULT_PRESET_ID = 'standard';
export const presetById = (id, list = BUILTIN_PRESETS) => list.find((p) => p.id === id) || list[0];

/** records (objects keyed by LONG_COLUMNS) -> { header, aoa (header first), delimiter }. */
export const applyPreset = (records, preset = BUILTIN_PRESETS[0]) => {
  const columns = (preset.columns?.length ? preset.columns : LONG_COLUMNS).filter((c) => LONG_COLUMNS.includes(c));
  const keep = records.filter((r) => (preset.totalMode === 'only' ? r.day === 'TOTAL' : preset.totalMode === 'days' ? r.day !== 'TOTAL' : true));
  const header = columns.map((c) => preset.rename?.[c] || c);
  return { header, delimiter: preset.delimiter || ',', aoa: [header, ...keep.map((r) => columns.map((c) => r[c] ?? ''))] };
};

// ---- last choice, kept locally until the profile store exists (settings-profile can replace load/save) ----
const KEY = 'moowhan.flat-export.v1';
export const DEFAULT_SETTINGS = { preset: DEFAULT_PRESET_ID, zip: false, includeSheet: false };
export const loadSettings = (storage = globalThis.localStorage) => {
  try {
    const v = JSON.parse(storage.getItem(KEY));
    if (!v || typeof v !== 'object') return DEFAULT_SETTINGS;
    return {
      preset: BUILTIN_PRESETS.some((p) => p.id === v.preset) ? v.preset : DEFAULT_SETTINGS.preset,
      zip: v.zip === true,
      includeSheet: v.includeSheet === true,
    };
  } catch { return DEFAULT_SETTINGS; }
};
export const saveSettings = (s, storage = globalThis.localStorage) => {
  try { storage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
};
