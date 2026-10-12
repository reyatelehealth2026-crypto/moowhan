// Adapter for data owned by other features, so the integrator has one place to swap.
//  - previous-run files (for "ไฟล์ที่คาดว่าจะได้รับ"): run-history snapshots, read through its store when that
//    feature exists in the build. Nothing is persisted here and no new storage key is created.
import { partTypeFromName } from './logic.js';

// Vite rewrites import.meta.glob at build time; in plain Node (the import-cli CLI) it does not exist => no store
let optionalStore = {};
try { optionalStore = import.meta.glob('../run-history/store.js'); } catch { /* not running under Vite */ }

const newestRun = (runs = []) =>
  [...runs].sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))[0] || null;

const defaultProvider = async () => {
  const load = optionalStore['../run-history/store.js'];
  if (!load) return [];
  const { runStore } = await load();
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
