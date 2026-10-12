// ==================== STORAGE KEY REGISTRY ====================
// Every key that may be written to the local storage layer must be registered here first, so the
// "ข้อมูลที่เก็บในเครื่องนี้" panel can list exactly what exists and why. Features register their own
// keys with registerKey(); nobody else touches the browser storage APIs directly.
//
//   registerKey({ key: 'runs.*', tier: 'runs', purpose: 'ประวัติการรัน', retention: 90 })
//
// - key: exact name, or a prefix ending with ".*" (one registration covers run-history's many keys)
// - tier: one of TIERS
// - retention: days until sweepExpired() deletes the record, or null for "keep until the user wipes it"
export const TIERS = ['prefs', 'template', 'session', 'runs', 'handles'];

const isDev = () => {
  try { return !!import.meta.env?.DEV; } catch { return false; }
};

export function createRegistry() {
  const entries = new Map();
  const find = (key) => {
    if (entries.has(key)) return entries.get(key);
    for (const [k, v] of entries) if (k.endsWith('.*') && key.startsWith(k.slice(0, -1))) return v;
    return null;
  };
  return {
    register({ key, tier, purpose, retention = null }) {
      if (typeof key !== 'string' || !key) throw new Error('registerKey: ต้องระบุ key');
      if (!TIERS.includes(tier)) throw new Error(`registerKey: ไม่รู้จัก tier "${tier}" (ใช้ได้: ${TIERS.join(', ')})`);
      if (!purpose) throw new Error(`registerKey: key "${key}" ต้องมี purpose (อธิบายเป็นภาษาไทยว่าเก็บไว้ทำไม)`);
      const entry = { key, tier, purpose, retention };
      entries.set(key, entry);
      return entry;
    },
    find,
    list: () => [...entries.values()],
    /** Returns the registration, or throws in DEV / returns null (after a console warning) in production. */
    require(key, tier) {
      const e = find(key);
      if (e && (!tier || e.tier === tier)) return e;
      const msg = e
        ? `storage: key "${key}" ลงทะเบียนไว้ใน tier "${e.tier}" แต่ถูกเขียนใน tier "${tier}"`
        : `storage: key "${key}" ยังไม่ได้ลงทะเบียน เรียก registerKey() ก่อนเขียน`;
      if (isDev()) throw new Error(msg);
      console.warn(msg);
      return null;
    },
  };
}

export const defaultRegistry = createRegistry();
export const registerKey = (spec) => defaultRegistry.register(spec);
