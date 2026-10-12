// Shared in-memory view of the persisted run list (panel + hooks). Persistence goes through logic.js only.
import { DEFAULT_PREFS, importRuns, loadPrefs, loadRuns, patchLatest, saveRuns, savePrefs, toSnapshot, upsertRun } from './logic.js';

let snap = { runs: [], prefs: { ...DEFAULT_PREFS }, ready: false };
const subs = new Set();
let opts = {}; // tests may inject { storage }
let initP = null;
const set = (p) => { snap = { ...snap, ...p }; subs.forEach((f) => f()); };

export const runStore = {
  subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  snapshot: () => snap,
  configure(o) { opts = o || {}; initP = null; snap = { runs: [], prefs: { ...DEFAULT_PREFS }, ready: false }; },
  /** (re)load from storage; the panel calls this on mount so a wipe-all elsewhere is reflected */
  async refresh() {
    const [runs, prefs] = await Promise.all([loadRuns(opts), loadPrefs(opts)]);
    set({ runs, prefs, ready: true });
  },
  init() { return (initP ??= runStore.refresh()); },
  async record(input) {
    await runStore.init();
    const next = upsertRun(snap.runs, toSnapshot(input, { withParts: snap.prefs.tierB, manifest: input.manifest }));
    set({ runs: await saveRuns(next, opts) });
  },
  async patchLatest(patch) {
    await runStore.init();
    if (!snap.runs.length) return;
    set({ runs: await saveRuns(patchLatest(snap.runs, patch), opts) });
  },
  async remove(id) { set({ runs: await saveRuns(snap.runs.filter((r) => r.id !== id), opts) }); },
  async importJson(text) {
    const res = importRuns(text, snap.runs);
    if (res.ok) set({ runs: await saveRuns(res.list, opts) });
    return res;
  },
  async setPrefs(patch) { const prefs = { ...snap.prefs, ...patch }; set({ prefs }); await savePrefs(prefs, opts); },
};
