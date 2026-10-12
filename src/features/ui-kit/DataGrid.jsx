import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import useWindowedRows from '../daily-grid/useWindowedRows.js';
import EmptyState from './components/EmptyState.jsx';
import { ariaSort, nextSort, searchRows, sortRows, DEFAULT_SEARCH_FIELDS } from './gridUtils.js';
import { STRINGS, foundOf } from './strings.js';
import { formatNumber } from '../../utils/format.js';

const ROW_H = 40;

/**
 * Shared table.
 *  columns: [{ key, label, num, sortable, render(row), value(row), className }]   (first column is sticky)
 *  rows, getKey(row), footer(filteredRows) -> { [columnKey]: node } (optional), footerLabel
 *  searchable, searchFields, initialSort {key,dir}, resetKey (sort + search reset when it changes)
 *  toolbar (node left of the search), renderExpanded(row) -> node (turns rows into expandable groups)
 *  emptyMessage, emptyIcon, maxHeight
 */
export default function DataGrid({
  columns, rows, getKey, footer, footerLabel, searchable = true, searchFields = DEFAULT_SEARCH_FIELDS,
  initialSort = null, resetKey, toolbar, renderExpanded, emptyMessage = STRINGS.empty.noData, emptyIcon = Icons.Search,
  maxHeight = '70vh', rowHeight = ROW_H, testId,
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [open, setOpen] = useState({});
  const scroller = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSort(initialSort);
    setQuery('');
    setOpen({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const colByKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns]);
  const shown = useMemo(() => {
    const found = searchRows(rows, query, searchFields);
    const col = sort ? colByKey[sort.key] : null;
    return sort ? sortRows(found, sort.key, sort.dir, col?.value ? (r) => col.value(r) : undefined) : found;
  }, [rows, query, searchFields, sort, colByKey]);

  const anyOpen = renderExpanded && Object.values(open).some(Boolean);
  const win = useWindowedRows(scroller, shown.length, { rowHeight, overscan: 20, threshold: anyOpen ? Infinity : 200, viewport: 600 });
  const slice = shown.slice(win.start, win.end);
  const totals = footer && shown.length ? footer(shown) : null;
  const colSpan = columns.length;

  const cell = (col, row) => {
    const v = col.render ? col.render(row) : col.value ? col.value(row) : row[col.key];
    return col.num && typeof v === 'number' ? formatNumber(v) : v ?? '';
  };
  const stickyFirst = 'sticky left-0 z-10';

  return (
    <div className="flex flex-col" data-testid={testId}>
      {(searchable || toolbar) && (
        <div className="px-4 sm:px-6 py-3 border-b bg-slate-50 flex flex-wrap items-center gap-3">
          {toolbar}
          {searchable && (
            <div className="relative ml-auto flex items-center gap-3 min-w-0 flex-1 sm:flex-none">
              <span className="text-sm text-slate-500 whitespace-nowrap num" aria-live="polite">{foundOf(shown.length, rows.length)}</span>
              <div className="relative flex-1 sm:w-72">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"><Icons.Search /></span>
                <input
                  type="text"
                  data-search-input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); } }}
                  placeholder={STRINGS.search.placeholder}
                  aria-label={STRINGS.search.placeholder}
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                />
              </div>
            </div>
          )}
        </div>
      )}
      <div ref={scroller} className="overflow-auto w-full" style={{ maxHeight }}>
        <table className="w-full text-sm leading-[1.6] border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((col, i) => {
                const sortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sortable ? ariaSort(sort, col.key) : undefined}
                    className={`sticky top-0 bg-slate-100 border-b border-slate-200 px-3 py-2 font-semibold text-slate-700 whitespace-nowrap ${col.num ? 'text-right' : 'text-left'} ${i === 0 ? 'left-0 z-30' : 'z-20'}`}
                  >
                    {sortable ? (
                      <button type="button" onClick={() => setSort((s) => nextSort(s, col.key))} className={`inline-flex items-center gap-1 font-semibold hover:text-blue-700 min-h-[28px] ${col.num ? 'flex-row-reverse' : ''}`}>
                        {col.label}
                        <span className={`w-3.5 h-3.5 ${sort?.key === col.key ? 'text-blue-600' : 'text-slate-300'}`} aria-hidden="true">
                          {sort?.key === col.key && sort.dir === 'desc' ? <Icons.ChevronDown /> : sort?.key === col.key ? <Icons.ChevronUp /> : <Icons.Sort />}
                        </span>
                      </button>
                    ) : col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {win.padTop > 0 && <tr aria-hidden="true"><td colSpan={colSpan} style={{ height: win.padTop, padding: 0 }} /></tr>}
            {slice.map((row) => {
              const key = getKey(row);
              const expanded = renderExpanded && open[key];
              return (
                <Fragment key={key}>
                  <tr className="hover:bg-slate-50 group" style={win.windowed ? { height: rowHeight } : undefined}>
                    {columns.map((col, i) => (
                      <td key={col.key} className={`border-b border-slate-100 px-3 py-1.5 whitespace-nowrap bg-white group-hover:bg-slate-50 ${col.num ? 'num text-right' : 'text-left'} ${i === 0 ? stickyFirst : ''} ${col.className || ''}`}>
                        {i === 0 && renderExpanded ? (
                          <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} aria-expanded={!!expanded} className="inline-flex items-center gap-2 text-left min-h-[28px]">
                            <span className="w-4 h-4 text-slate-400 flex-shrink-0">{expanded ? <Icons.ChevronUp /> : <Icons.ChevronDown />}</span>
                            {cell(col, row)}
                          </button>
                        ) : cell(col, row)}
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr><td colSpan={colSpan} className="bg-slate-50 border-b border-slate-200 px-3 sm:px-6 py-3">{renderExpanded(row)}</td></tr>
                  )}
                </Fragment>
              );
            })}
            {win.padBottom > 0 && <tr aria-hidden="true"><td colSpan={colSpan} style={{ height: win.padBottom, padding: 0 }} /></tr>}
          </tbody>
          {totals && (
            <tfoot>
              <tr>
                {columns.map((col, i) => (
                  <td key={col.key} className={`sticky bottom-0 bg-slate-100 border-t border-slate-200 px-3 py-2 font-semibold ${col.num ? 'num text-right' : 'text-left'} ${i === 0 ? 'left-0 z-20' : 'z-10'}`}>
                    {i === 0 ? footerLabel?.(shown) ?? totals[col.key] : typeof totals[col.key] === 'number' ? formatNumber(totals[col.key]) : totals[col.key] ?? ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
        {shown.length === 0 && <EmptyState Icon={emptyIcon} message={emptyMessage} />}
      </div>
    </div>
  );
}
