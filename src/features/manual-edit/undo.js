// Single-level undo kept inside the feature. A pushed snapshot lives for `ttl` ms (the toast lifetime),
// a newer push replaces it. Pure: timers are injectable so tests can drive them.
export const UNDO_MS = 6000;

export function createUndoStore({ ttl = UNDO_MS, setTimer = (...a) => setTimeout(...a), clearTimer = (t) => clearTimeout(t) } = {}) {
  let slot = null;
  let timer = null;
  let seq = 0;
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(slot));
  const stop = () => { if (timer !== null) clearTimer(timer); timer = null; };

  const store = {
    /** push(snapshot, label?) -> id. Replaces any pending snapshot and restarts the timer. */
    push(snapshot, label = '') {
      stop();
      slot = { id: ++seq, snapshot, label };
      timer = setTimer(() => { timer = null; slot = null; emit(); }, ttl);
      emit();
      return slot.id;
    },
    /** Returns the snapshot (once) or null when nothing is pending / it expired. */
    restore(id) {
      if (!slot || (id !== undefined && id !== slot.id)) return null;
      const { snapshot } = slot;
      stop();
      slot = null;
      emit();
      return snapshot;
    },
    clear() { stop(); const had = !!slot; slot = null; if (had) emit(); },
    has: () => !!slot,
    peek: () => slot,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  return store;
}

/** The app-wide store used by the manual-edit UI. */
export const editUndo = createUndoStore();
