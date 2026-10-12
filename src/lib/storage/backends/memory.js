// In-memory backend: used by tests and as the fallback when IndexedDB/localStorage are unavailable.
// Values are structured-cloned on the way in and out so callers cannot mutate stored records.
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : v);

export function createMemoryBackend() {
  const stores = new Map();
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  return {
    name: 'memory',
    async get(s, key) { const r = store(s).get(key); return r === undefined ? undefined : clone(r); },
    async put(s, key, record) { store(s).set(key, clone(record)); },
    async delete(s, key) { store(s).delete(key); },
    async getAll(s) { return [...store(s)].map(([k, v]) => [k, clone(v)]); },
    async clear(s) { store(s).clear(); },
    async clearAll() { stores.clear(); },
  };
}
