// Pure helpers for DataGrid (no DOM/React) so they can be tested in Node.
export const DEFAULT_SEARCH_FIELDS = ['partNumber', 'partCode', 'dockCode'];

/** Case-insensitive substring search over the given fields. Empty query returns rows unchanged. */
export const searchRows = (rows, q, fields = DEFAULT_SEARCH_FIELDS) => {
  const needle = String(q ?? '').trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => fields.some((f) => String(row?.[f] ?? '').toLowerCase().includes(needle)));
};

const isNil = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

/** Stable sort. null/undefined/NaN always go last (both directions); numbers before strings. */
export const sortRows = (rows, key, dir = 'asc', getValue = (row, k) => row?.[k]) => {
  if (key == null) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i, v: getValue(row, key) }))
    .sort((a, b) => {
      const an = isNil(a.v);
      const bn = isNil(b.v);
      if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
      let c;
      if (typeof a.v === 'number' && typeof b.v === 'number') c = a.v - b.v;
      else if (typeof a.v === 'number') c = -1;
      else if (typeof b.v === 'number') c = 1;
      else c = String(a.v).localeCompare(String(b.v), 'en', { numeric: true, sensitivity: 'base' });
      return c * sign || a.i - b.i;
    })
    .map((x) => x.row);
};

/** Click on a header: new column -> asc, same column -> asc/desc toggle. */
export const nextSort = (sort, key) =>
  sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };

export const ariaSort = (sort, key) => (sort?.key === key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none');
