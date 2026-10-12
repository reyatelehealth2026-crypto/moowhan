// IndexedDB backend (native API, no dependency). One object store per tier, out-of-line keys.
const DB_NAME = 'moowhan';
const DB_VERSION = 1;

export function createIndexedDBBackend({ name = DB_NAME, stores = ['template', 'session', 'runs', 'handles'], factory } = {}) {
  let dbPromise = null;
  const open = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const idb = factory ?? globalThis.indexedDB;
      if (!idb) { reject(new Error('IndexedDB ใช้ไม่ได้')); return; }
      let req;
      try { req = idb.open(name, DB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        stores.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('เปิด IndexedDB ไม่สำเร็จ'));
      req.onblocked = () => reject(new Error('IndexedDB ถูกบล็อก'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  };
  // run one request inside a transaction and resolve with its result once the transaction completes
  const tx = async (s, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(s, mode);
      let out;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction ถูกยกเลิก'));
      const r = fn(t.objectStore(s));
      if (r) r.onsuccess = () => { out = r.result; };
    });
  };
  return {
    name: 'indexeddb',
    open: async () => { await open(); },
    get: (s, key) => tx(s, 'readonly', (os) => os.get(key)),
    put: async (s, key, record) => { await tx(s, 'readwrite', (os) => os.put(record, key)); },
    delete: async (s, key) => { await tx(s, 'readwrite', (os) => os.delete(key)); },
    async getAll(s) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const out = [];
        const t = db.transaction(s, 'readonly');
        const req = t.objectStore(s).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) { out.push([c.key, c.value]); c.continue(); } else resolve(out);
        };
        req.onerror = () => reject(req.error);
      });
    },
    clear: async (s) => { await tx(s, 'readwrite', (os) => os.clear()); },
    async clearAll() { for (const s of stores) await tx(s, 'readwrite', (os) => os.clear()); },
  };
}
