import { MONTH_KEYS } from '../../constants.js';

/** Parts sorted by 4-month total, with cumulative share (0..1). */
export const paretoByPart = (summary) => {
  const list = (summary || [])
    .map((r) => ({ partNumber: r.partNumber, total: MONTH_KEYS.reduce((s, k) => s + (r[k] || 0), 0) }))
    .sort((a, b) => b.total - a.total || a.partNumber.localeCompare(b.partNumber));
  const grand = list.reduce((s, r) => s + r.total, 0);
  let acc = 0;
  const items = list.map((r, i) => {
    acc += r.total;
    return { ...r, rank: i + 1, share: grand ? r.total / grand : 0, cumulative: grand ? acc / grand : 0 };
  });
  const top5Share = items.slice(0, 5).reduce((s, r) => s + r.share, 0);
  const countToReach = (target = 0.8) => {
    if (!grand) return 0;
    const i = items.findIndex((r) => r.cumulative >= target - 1e-9);
    return i < 0 ? items.length : i + 1;
  };
  return { items, grand, top5Share, countToReach };
};
