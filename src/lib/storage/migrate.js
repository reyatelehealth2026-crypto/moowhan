// ==================== RECORD MIGRATIONS ====================
// Every stored record is an envelope: { schemaVersion, key, tier, savedAt, expiresAt, size, value }.
// A single migration chain runs when the storage opens. To change the shape, bump SCHEMA_VERSION and
// call registerMigration(fromVersion, fn) where fn(record, ctx) returns the record at fromVersion + 1.
export const SCHEMA_VERSION = 2;

const DAY = 86400000;
const steps = new Map();
export const registerMigration = (from, fn) => { steps.set(from, fn); };

/** Rough byte size of a value (ArrayBuffer/typed arrays exact, the rest approximated). */
export const estimateSize = (v, depth = 0) => {
  if (v === null || v === undefined) return 0;
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return v.byteLength;
  if (typeof v === 'string') return v.length * 2;
  if (typeof v === 'number') return 8;
  if (typeof v === 'boolean') return 4;
  if (depth > 12 || typeof v !== 'object') return 0;
  if (Array.isArray(v)) return v.reduce((n, x) => n + estimateSize(x, depth + 1), 0);
  return Object.entries(v).reduce((n, [k, x]) => n + k.length * 2 + estimateSize(x, depth + 1), 0);
};

// v1 -> v2: v1 records only had { key, savedAt, value }. Add tier, size and expiresAt.
registerMigration(1, (rec, ctx) => {
  const days = ctx.retentionDays?.(rec.key);
  return {
    ...rec,
    schemaVersion: 2,
    tier: rec.tier ?? ctx.tier,
    size: rec.size ?? estimateSize(rec.value),
    expiresAt: rec.expiresAt ?? (days ? rec.savedAt + days * DAY : null),
  };
});

/** migrate(record, from, to, ctx) -> record at version `to`. ctx: { tier, retentionDays(key) }. */
export const migrate = (record, from = record?.schemaVersion ?? 1, to = SCHEMA_VERSION, ctx = {}) => {
  let rec = record;
  for (let v = from; v < to; v++) {
    const step = steps.get(v);
    if (!step) throw new Error(`storage: ไม่มี migration จาก v${v} ไป v${v + 1}`);
    rec = step(rec, ctx);
  }
  return rec;
};
