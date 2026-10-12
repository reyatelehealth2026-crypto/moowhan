// ==================== CLIPBOARD / WEB SHARE ====================
// The only file allowed to touch navigator.clipboard (checked by tests/share-clipboard.test.js).
export { toTsv } from './serialize.js';

const execCopy = (text) => {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return !!document.execCommand?.('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
};

/** Call inside the click handler. Never throws: { ok, method: 'clipboard' | 'execCommand' | null }. */
export const copyText = async (text) => {
  const value = String(text ?? '');
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return { ok: true, method: 'clipboard' };
    }
  } catch { /* denied or unavailable: fall through to the textarea fallback */ }
  return execCopy(value) ? { ok: true, method: 'execCommand' } : { ok: false, method: null };
};

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Wraps navigator.share; the user cancelling (AbortError) is not an error. Returns true when shared. */
export const shareText = async (text, title) => {
  if (!canShare()) return false;
  try {
    await navigator.share({ text: String(text ?? ''), title });
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return false;
    throw e;
  }
};
