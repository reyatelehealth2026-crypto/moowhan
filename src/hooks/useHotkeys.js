import { useEffect, useRef } from 'react';
import { dispatchHotkey, keyboardOwned, listHotkeys } from '../features/ui-kit/hotkeys.js';

/**
 * Global shortcuts. `state` = { canProcess, canExport } (read fresh on every key);
 * `handlers` = { process, export, focusSearch?, [`custom:<id>`] }.
 * Shortcuts registered through registerHotkey() (e.g. help-center '?') are dispatched as `custom:<id>`.
 */
export default function useHotkeys(state, handlers) {
  const ref = useRef({ state, handlers });
  ref.current = { state, handlers };
  useEffect(() => {
    const onKey = (e) => {
      const { state: s, handlers: h } = ref.current;
      const hit = dispatchHotkey(e, { ...s, suspended: keyboardOwned() }, listHotkeys().map((d) => ({ ...d, id: d.id })));
      if (!hit) return;
      if (hit.action === 'focusSearch') {
        const el = [...document.querySelectorAll('[data-search-input]')].find((x) => x.offsetParent !== null);
        if (!el) return;
        e.preventDefault();
        el.focus();
        el.select?.();
        return;
      }
      const fn = h?.[hit.action];
      if (!fn) return;
      if (hit.preventDefault) e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
