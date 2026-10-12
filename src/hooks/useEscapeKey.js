import { useEffect } from 'react';

// Call `onEscape` when the user presses Escape (used by modal overlays).
export default function useEscapeKey(onEscape, enabled = true) {
  useEffect(() => {
    if (!enabled || !onEscape) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, enabled]);
}
