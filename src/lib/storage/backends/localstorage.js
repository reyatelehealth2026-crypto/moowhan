// localStorage backend for small prefs. Namespaced "moowhan.<store>.<key>"; values are JSON.
import { createMemoryBackend } from './memory.js';

const NS = 'moowhan.';

export function createLocalStorageBackend(ls) {
  const area = () => {
    const a = ls ?? globalThis.localStorage;
    if (!a) throw new Error('localStorage ใช้ไม่ได้');
    return a;
  };
  const keysOf = (prefix) => {
    const a = area();
    const out = [];
    for (let i = 0; i < a.length; i++) { const k = a.key(i); if (k && k.startsWith(prefix)) out.push(k); }
    return out;
  };
  return {
    name: 'localStorage',
    async open() { area().getItem(`${NS}probe`); },
    async get(s, key) { const raw = area().getItem(`${NS}${s}.${key}`); return raw === null ? undefined : JSON.parse(raw); },
    async put(s, key, record) { area().setItem(`${NS}${s}.${key}`, JSON.stringify(record)); },
    async delete(s, key) { area().removeItem(`${NS}${s}.${key}`); },
    async getAll(s) {
      const prefix = `${NS}${s}.`;
      return keysOf(prefix).map((k) => [k.slice(prefix.length), JSON.parse(area().getItem(k))]);
    },
    async clear(s) { keysOf(`${NS}${s}.`).forEach((k) => area().removeItem(k)); },
    async clearAll() { keysOf(NS).forEach((k) => area().removeItem(k)); },
  };
}

export { createMemoryBackend };
