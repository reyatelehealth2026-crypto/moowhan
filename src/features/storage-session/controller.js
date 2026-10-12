// ==================== STORAGE-SESSION CONTROLLER (no React) ====================
// Owns the opt-in policy, the autosave debounce and the save/restore/forget flows on top of
// src/lib/storage. The UI subscribes to snapshot(); settings-profile / run-history can reuse the
// same prefs record (key "prefs.storage") or the exported singleton.
//   - template and session writes are OPT-IN: while the flag is off nothing is ever written.
import { getStorage, sha256Prefix } from '../../lib/storage/index.js';
import { DEFAULT_PREFS, deserializeSession, serializeSession } from './session.js';
import { runRestore } from './restore.js';

const PREFS_KEY = 'prefs.storage';
export const AUTOSAVE_MS = 1000;

export function createStorageSession({ storage = getStorage(), debounceMs = AUTOSAVE_MS, now = () => Date.now() } = {}) {
  let snap = { ready: false, prefs: { ...DEFAULT_PREFS }, sessionMeta: null, templateMeta: null, lastSavedAt: null, saving: false, restoring: false, degraded: false, error: null };
  const subs = new Set();
  const set = (patch) => { snap = { ...snap, ...patch }; subs.forEach((f) => f(snap)); };
  let timer = null;
  let initPromise = null;

  storage.subscribe?.((s) => set({ degraded: s.degraded }));

  const loadMetas = async () => {
    const [sessionMeta, templateMeta] = await Promise.all([storage.get('session', 'session.meta'), storage.get('template', 'template.meta')]);
    set({ sessionMeta: sessionMeta ?? null, templateMeta: templateMeta ?? null });
  };

  const ctrl = {
    snapshot: () => snap,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    storage,

    /** Opens storage, sweeps expired records, reads prefs + the small meta records only (no big buffers). */
    init() {
      initPromise ??= (async () => {
        try {
          await storage.open();
          await storage.sweepExpired();
          const prefs = { ...DEFAULT_PREFS, ...((await storage.get('prefs', PREFS_KEY)) || {}) };
          set({ prefs, degraded: storage.status().degraded });
          await loadMetas();
        } catch (error) { set({ error: error.message }); }
        set({ ready: true, degraded: storage.status().degraded });
      })();
      return initPromise;
    },

    async setPrefs(patch) {
      const prefs = { ...snap.prefs, ...patch };
      set({ prefs });
      await storage.put('prefs', PREFS_KEY, prefs);
      if (!prefs.saveSession) { clearTimeout(timer); timer = null; }
      return prefs;
    },

    // ----- template (opt-in) -----
    async rememberTemplate(template) {
      if (!template?.buffer) return false;
      const sha = await sha256Prefix(template.buffer);
      const meta = { name: template.name, size: template.size, savedAt: now(), sha256: sha };
      const ok = await storage.put('template', 'template.data', { name: template.name, buffer: template.buffer });
      if (!ok) return false;
      await storage.put('template', 'template.meta', meta);
      set({ templateMeta: meta });
      return true;
    },
    /** Removes ONLY the remembered template (never the session). */
    async forgetTemplate() {
      await storage.remove('template', 'template.meta');
      await storage.remove('template', 'template.data');
      set({ templateMeta: null });
    },
    /** -> File | null */
    async loadTemplateFile() {
      const d = await storage.get('template', 'template.data');
      if (!d?.buffer) return null;
      return new File([d.buffer], d.name, { lastModified: snap.templateMeta?.savedAt ?? now() });
    },

    // ----- session (opt-in) -----
    /** Saves the current job, replacing the previous one. No-op unless the flag is on. */
    async saveSession(state) {
      if (!snap.prefs.saveSession) return { ok: false, reason: 'disabled' };
      if (!state?.sourceFiles?.length) return { ok: false, reason: 'empty' };
      set({ saving: true });
      try {
        const { meta, data } = await serializeSession(state, { template: state.template, now: now() });
        const ttlDays = snap.prefs.sessionDays;
        const ok = await storage.put('session', 'session.data', data, { ttlDays });
        if (!ok) return { ok: false, reason: 'write-failed' };
        await storage.put('session', 'session.meta', meta, { ttlDays });
        set({ lastSavedAt: meta.savedAt, sessionMeta: meta });
        return { ok: true, meta };
      } catch (error) {
        set({ error: error.message });
        return { ok: false, reason: 'error', error };
      } finally { set({ saving: false }); }
    },
    /** Debounced autosave: a burst of changes writes once, 1 s after the last one. getState() is read at fire time. */
    scheduleAutosave(getState) {
      if (!snap.prefs.saveSession || snap.restoring) return;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; const s = getState(); if (s?.processedData) ctrl.saveSession(s); }, debounceMs);
    },
    cancelAutosave() { clearTimeout(timer); timer = null; },

    /** Reads the saved job and re-runs it through the normal path (needs { state, actions } from getCtx). */
    async restoreSession(getCtx) {
      set({ restoring: true });
      try {
        const data = await storage.get('session', 'session.data');
        if (!data) return { ok: false, error: 'ไม่พบงานที่บันทึกไว้ (อาจหมดอายุหรือถูกล้างแล้ว)' };
        const session = deserializeSession(data);
        const templateFile = getCtx().state.template ? null : await ctrl.loadTemplateFile();
        const out = await runRestore({ session, templateFile, getCtx });
        return { ...out, fileMeta: session.fileMeta, changeLog: session.changeLog, edits: session.edits, productionMonth: session.productionMonth };
      } catch (error) {
        return { ok: false, error: `กู้คืนงานไม่สำเร็จ: ${error.message}` };
      } finally { set({ restoring: false }); }
    },
    async discardSession() {
      ctrl.cancelAutosave();
      await storage.remove('session', 'session.meta');
      await storage.remove('session', 'session.data');
      set({ sessionMeta: null, lastSavedAt: null });
    },

    async inventory() { return storage.inventory(); },
    /** Wipes every store and every moowhan.* key, then resets the in-memory view. */
    async wipeAll() {
      ctrl.cancelAutosave();
      await storage.wipeAll();
      set({ prefs: { ...DEFAULT_PREFS }, sessionMeta: null, templateMeta: null, lastSavedAt: null });
    },
  };
  return ctrl;
}

let shared = null;
export const getStorageSession = () => (shared ??= createStorageSession());
export const setStorageSession = (c = null) => { shared = c; };
