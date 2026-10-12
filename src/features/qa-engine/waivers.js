// ==================== WAIVERS ("รับทราบ") (pure + injectable storage) ====================
// A waiver acknowledges one warning/info for one production month. It never applies to a different month,
// expires at the end of its production month (or earlier if `expires` is given), and cannot be set on
// "ต้องแก้" (error) issues. Waived issues leave badges/gates but stay in the QA Report with their reason.
//
// Storage: an adapter { read(): object|null, write(obj) }; the default is storageAdapter() over src/lib/storage.

import { getStorage, registerKey } from '../../lib/storage/index.js';

export const MIN_REASON = 3;

const pad = (n) => String(n).padStart(2, '0');
const pmString = (pm) => (typeof pm === 'string' ? pm : pm?.year ? `${pm.year}${pad(pm.month)}` : '');
const dayOf = (d) => {
  const x = d instanceof Date ? d : new Date(d ?? Date.now());
  return Number.isNaN(x.getTime()) ? '' : `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
/** Last calendar day of a production month ("2026-02-28"). */
export const endOfProductionMonth = (pm) => {
  const s = pmString(pm);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  if (!y || !m) return '';
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

/** rule|scopeKey|productionMonth. Row numbers are not part of the key (rows move between runs). */
export const waiverKey = (issue, productionMonth) => {
  const scopeKey = [issue.scope, issue.plant, issue.scope === 'file' ? issue.fileName : '', issue.partNumber, issue.dockCode, issue.month].join(':');
  return `${issue.rule}|${scopeKey}|${pmString(productionMonth)}`;
};

export const isActive = (record, today) => !!record && (!record.expires || dayOf(today) <= record.expires);

// ---------- adapters ----------
export const memoryAdapter = (initial = {}) => {
  let data = { ...initial };
  return { read: () => data, write: (next) => { data = { ...next }; } };
};
// Persisted through the storage layer (prefs tier): reads are served from memory (hydrate with loadSavedWaivers),
// writes go to storage in the background and never throw.
export const WAIVERS_KEY = 'qa.waivers';
registerKey({ key: WAIVERS_KEY, tier: 'prefs', purpose: 'รายการ “รับทราบ” ของผลตรวจคุณภาพ (หมดอายุสิ้นเดือนผลิต)', retention: null });
export const storageAdapter = (storage = getStorage()) => {
  let data = {};
  return {
    read: () => data,
    write: (obj) => { data = { ...obj }; Promise.resolve(storage.put('prefs', WAIVERS_KEY, data)).catch(() => {}); },
  };
};
/** Waivers saved in a previous session (or {} when none / storage unavailable). */
export const loadSavedWaivers = async (storage = getStorage()) => {
  try {
    const saved = await storage.get('prefs', WAIVERS_KEY);
    return saved && typeof saved === 'object' ? saved : {};
  } catch { return {}; }
};

/** Store over an adapter; every storage call is wrapped, with a memory copy as the fallback. */
export const createWaiverStore = (adapter = memoryAdapter()) => {
  let cache = null;
  const load = () => {
    if (cache) return cache;
    let data = null;
    try { data = adapter.read(); } catch { data = null; }
    cache = data && typeof data === 'object' ? { ...data } : {};
    return cache;
  };
  const save = () => { try { adapter.write(cache); } catch { /* keep memory copy */ } };

  return {
    /** all records (including expired) keyed by waiverKey */
    all: () => ({ ...load() }),
    /** active records only */
    active: (today) => Object.fromEntries(Object.entries(load()).filter(([, r]) => isActive(r, today))),
    /**
     * @returns {{ ok: true, key: string, record: object } | { ok: false, error: string }}
     */
    waive({ issue, reason, expires, productionMonth, today }) {
      if (!issue) return { ok: false, error: 'ไม่พบรายการที่จะรับทราบ' };
      if (issue.level === 'error') return { ok: false, error: 'รายการระดับ “ต้องแก้” รับทราบไม่ได้ ต้องแก้ข้อมูลก่อน' };
      const why = String(reason ?? '').trim();
      if (why.length < MIN_REASON) return { ok: false, error: `กรอกเหตุผลอย่างน้อย ${MIN_REASON} ตัวอักษร` };
      const end = endOfProductionMonth(productionMonth);
      const until = expires ? dayOf(expires) : end;
      const record = {
        key: waiverKey(issue, productionMonth), rule: issue.rule, reason: why, productionMonth: pmString(productionMonth),
        expires: end && until > end ? end : until, createdAt: new Date(today ?? Date.now()).toISOString(),
        label: [issue.plant, issue.partNumber, issue.fileName].filter(Boolean).join(' '),
      };
      load()[record.key] = record;
      save();
      return { ok: true, key: record.key, record };
    },
    unwaive(key) {
      const had = key in load();
      delete load()[key];
      save();
      return had;
    },
    /** merge records loaded from storage (existing in-memory records win) without writing back */
    hydrate(records) { cache = { ...(records || {}), ...load() }; },
    clear() { cache = {}; save(); },
  };
};

let defaultStore = null;
let injected = null;
/** Replace the storage behind the default store (storage-session, tests). */
export const setWaiverAdapter = (adapter) => { injected = adapter; defaultStore = null; };
export const getWaiverStore = () => {
  if (!defaultStore) {
    defaultStore = createWaiverStore(injected || storageAdapter());
  }
  return defaultStore;
};

/**
 * Mark issues covered by an active waiver. `waivers` = record map (store.all()) or array of records.
 * Error-level issues are never marked.
 */
export const applyWaivers = (issues, waivers, { productionMonth, today } = {}) => {
  const map = Array.isArray(waivers) ? Object.fromEntries(waivers.map((r) => [r.key, r])) : waivers;
  if (!map || !Object.keys(map).length) return issues;
  return issues.map((i) => {
    if (i.level === 'error') return i;
    const rec = map[waiverKey(i, productionMonth)];
    return isActive(rec, today) ? { ...i, waived: true, reason: rec.reason } : i;
  });
};
