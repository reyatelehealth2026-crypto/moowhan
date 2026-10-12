// Adapter for data owned by other features, so the integrator has one place to swap.
//  - previous-run files (for "ไฟล์ที่คาดว่าจะได้รับ"): run-history snapshots, read through its store.
//    Nothing is persisted here and no new storage key is created.
import { partTypeFromName } from './logic.js';
import { runStore } from '../run-history/store.js';

const newestRun = (runs = []) =>
  [...runs].sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))[0] || null;

const defaultProvider = async () => {
  await runStore.init();
  return newestRun(runStore.snapshot().runs)?.files || [];
};

let provider = defaultProvider;
let cache = [];

/** [{ name, plant, partType? }] -> same list with partType filled from the file name when missing ("GW veh DG7.xls" -> 'V') */
export const normalizePreviousFiles = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((f) => f && (f.plant || f.category))
    .map((f) => ({ name: f.name || '', plant: f.plant || f.category, partType: f.partType || partTypeFromName(f.name) }));

/** Swap the source of the previous run's files (tests, run-history wiring). Resets the cache. */
export const setPreviousFilesProvider = (fn) => { provider = fn || defaultProvider; cache = []; };

/** Files of the previous run as last loaded by refreshPreviousFiles() (sync, used by the F01 rule). */
export const getPreviousFiles = () => cache;

export const refreshPreviousFiles = async () => {
  try {
    cache = normalizePreviousFiles(await provider());
  } catch {
    cache = [];
  }
  return cache;
};
