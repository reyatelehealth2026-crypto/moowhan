import { PLANTS } from '../../constants.js';

const entryOf = (key, label, from, to) => {
  const diff = to - from;
  return { key, label, from, to, diff, pct: from === 0 ? null : (diff / from) * 100 };
};

/**
 * Biggest changes between two months. level 'part' uses summary rows; level 'row' needs
 * opts.processedData and keys Part|Plant|Dock. Returns { up, down } (zero diffs dropped).
 */
export const topMovers = (summary, fromKey = 'n', toKey = 'n1', limit = 5, { level = 'part', processedData } = {}) => {
  let list;
  if (level === 'row') {
    const map = new Map();
    PLANTS.forEach((plant) => (processedData?.[`${plant} Daily`] || []).forEach((r) => {
      const key = `${r.partNumber}|${plant}|${r.dockCode ?? ''}`;
      const cur = map.get(key) || { from: 0, to: 0, partNumber: r.partNumber, plant, dock: r.dockCode ?? '' };
      cur.from += r[fromKey] || 0;
      cur.to += r[toKey] || 0;
      map.set(key, cur);
    }));
    list = [...map.entries()].map(([key, v]) => ({ ...entryOf(key, key, v.from, v.to), partNumber: v.partNumber, plant: v.plant, dock: v.dock }));
  } else {
    list = (summary || []).map((r) => ({ ...entryOf(r.partNumber, r.partNumber, r[fromKey] || 0, r[toKey] || 0), partNumber: r.partNumber }));
  }
  const cmp = (a, b) => a.key.localeCompare(b.key);
  const up = list.filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff || cmp(a, b)).slice(0, limit);
  const down = list.filter((x) => x.diff < 0).sort((a, b) => a.diff - b.diff || cmp(a, b)).slice(0, limit);
  return { up, down };
};
