// Pure keyboard dispatch (testable in Node) + a tiny registry other features can extend (e.g. help-center '?').

const isEditable = (t) => {
  if (!t) return false;
  const tag = String(t.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
};

/**
 * event: { key, ctrlKey, metaKey, altKey, target }
 * ctx: { canProcess, canExport, suspended }
 * returns { action, preventDefault } | null   (action: 'process'|'export'|'focusSearch'|'escape'|`custom:<id>`)
 */
export function dispatchHotkey(event, ctx = {}, extra = []) {
  const key = String(event.key ?? '');
  const mod = !!(event.ctrlKey || event.metaKey);
  const inField = isEditable(event.target);
  if (key === 'Escape') return { action: 'escape', preventDefault: false };
  if (ctx.suspended || inField || event.altKey) return null;
  if (mod && key === 'Enter') return ctx.canProcess ? { action: 'process', preventDefault: true } : null;
  if (mod && key.toLowerCase() === 's') return ctx.canExport ? { action: 'export', preventDefault: true } : null;
  if (!mod && key === '/') return { action: 'focusSearch', preventDefault: true };
  for (const h of extra) {
    if (h.key === key && !!h.ctrl === mod) return { action: `custom:${h.id}`, preventDefault: h.preventDefault !== false };
  }
  return null;
}

// ---- modal keyboard ownership: while any modal with ownsKeyboard is open, global hotkeys are suspended ----
let owners = 0;
export const acquireKeyboard = () => {
  owners += 1;
  let released = false;
  return () => { if (!released) { released = true; owners -= 1; } };
};
export const keyboardOwned = () => owners > 0;

// ---- registration (help-center can list/register shortcuts) ----
const registry = new Map();
export const registerHotkey = (def) => {
  registry.set(def.id, def);
  return () => registry.delete(def.id);
};
export const listHotkeys = () => [...registry.values()];
