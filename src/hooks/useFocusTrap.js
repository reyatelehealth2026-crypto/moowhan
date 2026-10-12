import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Pure: index to focus after Tab / Shift+Tab inside a list of `count` focusables (-1 = focus is outside). */
export const cycleIndex = (count, current, shift) => {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return (current + (shift ? -1 : 1) + count) % count;
};

const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);

/** Trap Tab inside `ref` while mounted, focus the first control, restore focus to the opener on unmount. */
export default function useFocusTrap(ref, active = true) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return undefined;
    const opener = document.activeElement;
    (focusables(root)[0] || root).focus?.();
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const els = focusables(root);
      if (!els.length) { e.preventDefault(); root.focus(); return; }
      const idx = els.indexOf(document.activeElement);
      const next = cycleIndex(els.length, idx, e.shiftKey);
      // only intercept at the edges (or when focus escaped); otherwise let the browser move naturally
      if (idx < 0 || (e.shiftKey && idx === 0) || (!e.shiftKey && idx === els.length - 1)) {
        e.preventDefault();
        els[next].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus?.();
    };
  }, [ref, active]);
}
