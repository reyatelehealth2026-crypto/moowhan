// Injectable clock (pure, no DOM). Production code reads time through here so tests can pin it;
// only tests call setClock / withClock.
let override = null;

const toDate = (v) => (v instanceof Date ? new Date(v.getTime()) : new Date(v));

/** The current instant as a Date (a fresh copy every call). */
export const now = () => (override ? toDate(override()) : new Date());
export const isoNow = () => now().toISOString();
/** "YYYY-MM-DD" (UTC) */
export const today = () => isoNow().slice(0, 10);

/** setClock(fn) with fn() -> Date | ISO string | ms; setClock(null) restores the real clock. */
export const setClock = (fn) => { override = typeof fn === 'function' ? fn : null; };

/** Run fn with the clock fixed at `fixed` (Date | ISO string | ms | () => any); restores afterwards (async-safe). */
export const withClock = (fixed, fn) => {
  const prev = override;
  override = typeof fixed === 'function' ? fixed : () => fixed;
  const restore = () => { override = prev; };
  let out;
  try {
    out = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (out && typeof out.then === 'function') return out.finally(restore);
  restore();
  return out;
};
