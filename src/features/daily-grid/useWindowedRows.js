import { useEffect, useState } from 'react';

/**
 * Tiny row windowing for a fixed row height inside a scroll container.
 * Renders everything while count <= threshold; otherwise only the visible slice + overscan.
 */
export default function useWindowedRows(ref, count, { rowHeight = 28, overscan = 12, threshold = 80, viewport = 600 } = {}) {
  const [range, setRange] = useState({ top: 0, height: viewport });
  useEffect(() => {
    const el = ref.current;
    if (!el || count <= threshold) return undefined;
    const update = () => setRange({ top: el.scrollTop, height: el.clientHeight || viewport });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [ref, count, threshold, viewport]);
  return computeWindow(count, range.top, range.height, { rowHeight, overscan, threshold });
}

/** Pure part (testable): which rows to render. */
export const computeWindow = (count, scrollTop, height, { rowHeight = 28, overscan = 12, threshold = 80 } = {}) => {
  if (count <= threshold) return { start: 0, end: count, padTop: 0, padBottom: 0, windowed: false };
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return { start, end, padTop: start * rowHeight, padBottom: (count - end) * rowHeight, windowed: true };
};
