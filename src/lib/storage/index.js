// ==================== LOCAL STORAGE LAYER ====================
// The ONLY module allowed to touch the browser storage APIs (see tests/storage-session.test.js).
// Pure logic, no React/DOM. Everything is async and never throws to the caller: when the primary
// backend fails the layer falls back to memory, warns once and carries on.
//
// Tiers (TIERS):  prefs (small settings, localStorage) · template (remembered master file) ·
//                 session (the one current unfinished job) · runs (compact run manifests, no rawRow) ·
//                 handles (reserved).
//
// API (all async):
//   const storage = getStorage();                       // app singleton (IndexedDB + localStorage prefs)
//   registerKey({ key, tier, purpose, retention });     // required before the first write (re-exported)
//   storage.put(tier, key, value, { ttlDays })  -> boolean   unregistered key: throws in DEV, warns+false in prod
//   storage.get(tier, key)                      -> value | undefined      (expired records read as undefined)
//   storage.getRecord(tier, key)                -> envelope | undefined   { schemaVersion, key, tier, savedAt, expiresAt, size, value }
//   storage.remove(tier, key) · storage.list(tier) -> [envelope]
//   storage.inventory()  -> [{ key, tier, purpose, size, savedAt, expiresAt }]   registered keys only
//   storage.sweepExpired() -> number removed · storage.wipeTier(tier) · storage.wipeAll()  (all stores + every "moowhan.*" key)
//   storage.status() -> { backend, degraded, message } · storage.subscribe(fn) -> unsubscribe   (fn gets status on degrade)
// Storing big binary data: keep a small ".meta" record next to the heavy ".data" record so UI can show
// meta without loading the buffer (see features/storage-session).
import { TIERS, defaultRegistry, registerKey } from './registry.js';
import { SCHEMA_VERSION, estimateSize, migrate } from './migrate.js';
import { createMemoryBackend } from './backends/memory.js';
import { createIndexedDBBackend } from './backends/indexeddb.js';
import { createLocalStorageBackend } from './backends/localstorage.js';

export { TIERS, registerKey, SCHEMA_VERSION, estimateSize, migrate };
export { registerMigration } from './migrate.js';
export { createRegistry, defaultRegistry } from './registry.js';
export { createMemoryBackend } from './backends/memory.js';
export { sha256Prefix } from './hash.js';

export const STORAGE_UNAVAILABLE_MESSAGE = 'ไม่สามารถบันทึกในเครื่องได้ ฟังก์ชันอื่นยังใช้งานได้';
const DAY = 86400000;

// keys owned by the storage layer itself / storage-session (other features register their own)
registerKey({ key: 'prefs.storage', tier: 'prefs', purpose: 'ตั้งค่าการจำไฟล์หลักและการบันทึกงาน', retention: null });
registerKey({ key: 'template.meta', tier: 'template', purpose: 'รายละเอียดไฟล์หลักที่จำไว้ (ชื่อ ขนาด วันที่บันทึก)', retention: 90 });
registerKey({ key: 'template.data', tier: 'template', purpose: 'ไฟล์หลัก (Template) ที่จำไว้ในเครื่องนี้', retention: 90 });
registerKey({ key: 'session.meta', tier: 'session', purpose: 'สรุปงานค้างที่บันทึกไว้ (ใช้แสดงแบนเนอร์กู้คืน)', retention: 7 });
registerKey({ key: 'session.data', tier: 'session', purpose: 'งานค้างปัจจุบัน: ไฟล์ต้นทาง รายการแก้ไข ประวัติ', retention: 7 });

/**
 * createStorage({ backend, prefsBackend, registry, now })
 *  backend: heavy tiers (default IndexedDB) · prefsBackend: tier "prefs" (default localStorage)
 */
export function createStorage({ backend, prefsBackend, registry = defaultRegistry, now = () => Date.now() } = {}) {
  let primary = backend ?? createIndexedDBBackend();
  let prefs = prefsBackend ?? createLocalStorageBackend();
  const fallbacks = { heavy: createMemoryBackend(), prefs: createMemoryBackend() };
  let usingFallback = { heavy: false, prefs: false };
  let degraded = false;
  let message = '';
  const subs = new Set();

  const status = () => ({
    backend: usingFallback.heavy ? 'memory' : primary.name,
    degraded,
    message,
  });
  const degrade = (which, err) => {
    usingFallback[which] = true;
    if (degraded) return;
    degraded = true;
    message = STORAGE_UNAVAILABLE_MESSAGE;
    console.warn('storage: ใช้หน่วยความจำชั่วคราวแทน', err);
    subs.forEach((fn) => { try { fn(status()); } catch { /* ignore */ } });
  };
  const slot = (tier) => (tier === 'prefs' ? 'prefs' : 'heavy');
  const backendOf = (tier) => {
    const w = slot(tier);
    if (usingFallback[w]) return fallbacks[w];
    return w === 'prefs' ? prefs : primary;
  };
  // run op against the tier's backend; on failure degrade to memory and retry once; never throws
  const run = async (tier, op, fallbackValue) => {
    try { return await op(backendOf(tier)); } catch (err) {
      if (!usingFallback[slot(tier)]) {
        degrade(slot(tier), err);
        try { return await op(backendOf(tier)); } catch { return fallbackValue; }
      }
      return fallbackValue;
    }
  };
  const retentionDays = (key) => registry.find(key)?.retention ?? null;
  const live = (rec) => rec && typeof rec === 'object' && (rec.expiresAt == null || rec.expiresAt > now());
  const upgrade = (rec, tier) => {
    const v = rec?.schemaVersion ?? 1;
    if (v > SCHEMA_VERSION) return null; // written by a newer app: leave it alone
    return v === SCHEMA_VERSION ? rec : migrate(rec, v, SCHEMA_VERSION, { tier, retentionDays });
  };

  let opened = null;
  const open = () => {
    if (opened) return opened;
    opened = (async () => {
      for (const which of ['heavy', 'prefs']) {
        const b = which === 'prefs' ? prefs : primary;
        try { await b.open?.(); } catch (err) { degrade(which, err); }
      }
      // one migration pass over every store
      for (const tier of TIERS) {
        const rows = await run(tier, (b) => b.getAll(tier), []);
        for (const [key, rec] of rows) {
          try {
            if ((rec?.schemaVersion ?? 1) >= SCHEMA_VERSION) continue;
            const next = upgrade(rec, tier);
            if (next) await run(tier, (b) => b.put(tier, key, next));
          } catch (err) { console.warn(`storage: migrate "${key}" ไม่สำเร็จ`, err); }
        }
      }
      return status();
    })();
    return opened;
  };

  const api = {
    open,
    status,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    async put(tier, key, value, { ttlDays } = {}) {
      const entry = registry.require(key, tier);
      if (!entry) return false;
      await open();
      const days = ttlDays ?? entry.retention;
      const savedAt = now();
      const rec = {
        schemaVersion: SCHEMA_VERSION, key, tier, savedAt,
        expiresAt: days ? savedAt + days * DAY : null,
        size: estimateSize(value),
        value,
      };
      let ok = false;
      await run(tier, async (b) => { await b.put(tier, key, rec); ok = true; });
      return ok;
    },
    async getRecord(tier, key) {
      await open();
      const rec = await run(tier, (b) => b.get(tier, key));
      if (!rec) return undefined;
      let out;
      try { out = upgrade(rec, tier); } catch { out = null; }
      return live(out) ? out : undefined;
    },
    async get(tier, key) { return (await api.getRecord(tier, key))?.value; },
    async remove(tier, key) { await open(); await run(tier, (b) => b.delete(tier, key)); },
    async list(tier) {
      await open();
      const rows = await run(tier, (b) => b.getAll(tier), []);
      return rows.map(([, r]) => r).filter(live);
    },
    async inventory() {
      const out = [];
      for (const tier of TIERS) {
        for (const r of await api.list(tier)) {
          const entry = registry.find(r.key);
          if (!entry) continue;
          out.push({ key: r.key, tier, purpose: entry.purpose, size: r.size ?? 0, savedAt: r.savedAt, expiresAt: r.expiresAt ?? null });
        }
      }
      return out;
    },
    /** Deletes records past their expiry (run once at start). Returns how many were removed. */
    async sweepExpired() {
      await open();
      let n = 0;
      for (const tier of TIERS) {
        const rows = await run(tier, (b) => b.getAll(tier), []);
        for (const [key, rec] of rows) {
          if (rec?.expiresAt != null && rec.expiresAt <= now()) { await run(tier, (b) => b.delete(tier, key)); n++; }
        }
      }
      return n;
    },
    async wipeTier(tier) { await open(); await run(tier, (b) => b.clear(tier)); },
    /** Clears every store and every "moowhan.*" key. */
    async wipeAll() {
      await open();
      await run('session', (b) => b.clearAll());
      await run('prefs', (b) => b.clearAll());
      fallbacks.heavy.clearAll(); fallbacks.prefs.clearAll();
    },
  };
  return api;
}

let singleton = null;
/** App-wide storage (lazy, IndexedDB + localStorage prefs). */
export const getStorage = () => (singleton ??= createStorage());
/** Tests / embedders: replace (or with no argument, drop) the app singleton. */
export const setStorage = (s = null) => { singleton = s; };
