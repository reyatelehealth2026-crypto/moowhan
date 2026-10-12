import { useMemo, useState } from 'react';
import Icons from './Icons.jsx';
import Modal from './Modal.jsx';
import { MONTH_HEADERS, SOURCE_HEADERS } from '../constants.js';
import { formatNumber, getColumnLetter } from '../utils/format.js';
import { PreviewDiffBar, PreviewDiffToggle, TAG_CLASS, TAG_LABEL, useTemplateDiff } from '../features/compare/PreviewDiff.jsx';
import { rowKey } from '../features/compare/tagRows.js';

// ==================== EXCEL PREVIEW ====================
// Spreadsheet-like preview of what the export will contain.
export default function ExcelPreview({ data, summaryData, fileName, onClose, onDownload, template = null }) {
  const [activeSheet, setActiveSheet] = useState('Summary');
  const [zoom, setZoom] = useState(100);
  const [showGridlines, setShowGridlines] = useState(true);
  const [highlightedCells, setHighlightedCells] = useState(() => new Set());
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterValue, setFilterValue] = useState('');
  const [diffOn, setDiffOn] = useState(false); // compare feature: tag rows against the template's own sheet
  const diff = useTemplateDiff(template, diffOn, data);
  const tagOf = (row) => (diff?.status === 'ready' && diff.bySheet[activeSheet] ? diff.bySheet[activeSheet].tags.get(rowKey({ part: row[0], dock: row[5] })) : undefined);

  const sheets = useMemo(() => {
    const list = [];
    if (summaryData) list.push('Summary');
    Object.entries(data || {}).forEach(([sheet, rows]) => { if (rows?.length) list.push(sheet); });
    return list;
  }, [data, summaryData]);

  const currentSheet = useMemo(() => {
    let headers, rows, colWidths, numberCols;
    if (activeSheet === 'Summary') {
      headers = ['Part Number', 'Plants', 'Sum of N', 'Sum of N+1', 'Sum of N+2', 'Sum of N+3', 'Total'];
      colWidths = [180, 120, 90, 90, 90, 90, 90];
      numberCols = [2, 3, 4, 5, 6];
      rows = (summaryData || []).map((r) => [r.partNumber, r.plants, r.n, r.n1, r.n2, r.n3, r.n + r.n1 + r.n2 + r.n3]);
    } else {
      headers = [...SOURCE_HEADERS, ...MONTH_HEADERS];
      colWidths = [160, 90, 180, 90, 100, 80, 100, 90, 70, 70, 70, 70];
      numberCols = [7, 8, 9, 10, 11];
      rows = (data?.[activeSheet] || []).map((r) => [r.partNumber, r.partCode, r.partDesc, r.suppCode, r.shippingDock, r.dockCode, r.carFamily, r.packingSize, r.n, r.n1, r.n2, r.n3]);
    }

    if (filterValue) {
      const q = filterValue.toLowerCase();
      rows = rows.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(q)));
    }
    if (sortConfig.key !== null) {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = a[sortConfig.key];
        const bv = b[sortConfig.key];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      });
    }
    return { headers, rows, colWidths, numberCols };
  }, [activeSheet, data, summaryData, filterValue, sortConfig]);

  const toggleHighlight = (rowIdx, colIdx) => {
    const key = `${activeSheet}-${rowIdx}-${colIdx}`;
    setHighlightedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSort = (colIdx) =>
    setSortConfig((prev) => ({ key: colIdx, direction: prev.key === colIdx && prev.direction === 'asc' ? 'desc' : 'asc' }));

  const border = showGridlines ? 'border border-slate-300' : 'border border-transparent';

  return (
    <Modal onClose={onClose} className="max-w-7xl h-[92vh]" label="Preview Excel">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white flex-shrink-0"><Icons.File /></div>
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-lg">Preview Excel</h2>
            <p className="text-emerald-100 text-sm truncate">{fileName || 'Production_Summary.xlsx'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <button onClick={onDownload} data-testid="download-preview" className="px-3 sm:px-4 py-2 bg-white text-emerald-700 rounded-lg font-medium hover:bg-emerald-50 flex items-center gap-2">
            <span className="w-4 h-4"><Icons.Download /></span><span className="hidden sm:inline">ดาวน์โหลด</span>
          </button>
          <button onClick={onClose} className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-lg text-white" aria-label="ปิด">✕</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-3 sm:gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-500">
          ซูม:
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="px-2 py-1 border border-slate-300 rounded text-sm">
            {[75, 100, 125, 150].map((z) => <option key={z} value={z}>{z}%</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
          <input type="checkbox" checked={showGridlines} onChange={(e) => setShowGridlines(e.target.checked)} className="rounded" />
          เส้นตาราง
        </label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"><Icons.Search /></span>
          <input
            type="text"
            placeholder="ค้นหา..."
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="pl-8 pr-3 py-1 border border-slate-300 rounded text-sm w-40"
          />
        </div>
        {template?.kind === 'xlsx' && activeSheet !== 'Summary' && <PreviewDiffToggle checked={diffOn} onChange={setDiffOn} />}
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
          <span>{formatNumber(currentSheet.rows.length)} แถว</span>
          <span>•</span>
          <span>{currentSheet.headers.length} คอลัมน์</span>
        </div>
      </div>

      {/* Sheet tabs */}
      <div className="bg-slate-100 border-b border-slate-200 flex overflow-x-auto">
        {sheets.map((sheet) => (
          <button
            key={sheet}
            onClick={() => { setActiveSheet(sheet); setSortConfig({ key: null, direction: 'asc' }); }}
            className={`px-4 sm:px-6 py-2.5 text-sm font-medium border-r border-slate-200 whitespace-nowrap transition-colors ${
              activeSheet === sheet ? 'bg-white text-emerald-700 border-t-2 border-t-emerald-500' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {sheet}
            {sheet !== 'Summary' && <span className="ml-2 text-xs text-slate-400">({data[sheet].length})</span>}
          </button>
        ))}
      </div>

      {diffOn && activeSheet !== 'Summary' && <PreviewDiffBar diff={diff} sheet={activeSheet} />}

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white">
        <div className="inline-block min-w-full" style={{ zoom: zoom / 100 }}>
          <table className="border-collapse">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className={`w-12 h-8 bg-slate-200 ${border} sticky left-0 z-30`} />
                {currentSheet.headers.map((_, idx) => (
                  <th key={idx} className={`h-8 bg-slate-100 ${border} text-xs text-slate-500 font-medium text-center`} style={{ minWidth: currentSheet.colWidths[idx] || 100 }}>
                    {getColumnLetter(idx + 1)}
                  </th>
                ))}
              </tr>
              <tr>
                <th className={`w-12 h-10 bg-slate-200 ${border} sticky left-0 z-30 text-xs text-slate-600`}>1</th>
                {currentSheet.headers.map((header, idx) => (
                  <th
                    key={idx}
                    aria-sort={sortConfig.key === idx ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`h-10 ${border} text-xs font-semibold text-slate-700 px-2 text-left whitespace-nowrap select-none ${currentSheet.numberCols.includes(idx) ? 'bg-blue-50 hover:bg-blue-100' : 'bg-emerald-50 hover:bg-emerald-100'}`}
                    style={{ minWidth: currentSheet.colWidths[idx] || 100 }}
                  >
                    <button type="button" onClick={() => handleSort(idx)} title="คลิกเพื่อเรียงลำดับ" className="w-full flex items-center justify-between gap-2 font-semibold min-h-[32px]">
                      {header}
                      {sortConfig.key === idx && <span className="text-emerald-600" aria-hidden="true">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.map((row, rowIdx) => {
                const tag = tagOf(row);
                return (
                <tr key={rowIdx}>
                  <td className={`w-12 h-8 bg-slate-50 ${border} sticky left-0 z-10 text-xs text-slate-500 text-center font-medium`} title={TAG_LABEL[tag]}>{rowIdx + 2}{tag && TAG_LABEL[tag] && <span className="sr-only"> ({TAG_LABEL[tag]})</span>}</td>
                  {row.map((cell, colIdx) => {
                    const isHighlighted = highlightedCells.has(`${activeSheet}-${rowIdx}-${colIdx}`);
                    const isNumberCol = currentSheet.numberCols.includes(colIdx);
                    return (
                      <td
                        key={colIdx}
                        onClick={() => toggleHighlight(rowIdx, colIdx)}
                        className={`h-8 ${border} text-xs px-2 whitespace-nowrap cursor-pointer ${isHighlighted ? 'bg-yellow-200 ring-2 ring-yellow-400 ring-inset' : TAG_CLASS[tag] ? TAG_CLASS[tag] : isNumberCol ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50'}`}
                        style={{ textAlign: typeof cell === 'number' ? 'right' : 'left' }}
                      >
                        {typeof cell === 'number' ? formatNumber(cell) : (cell ?? '')}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
              {currentSheet.rows.length === 0 && (
                <tr><td colSpan={currentSheet.headers.length + 1} className="py-10 text-center text-slate-400 text-sm">ไม่พบข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-emerald-600 text-white px-4 py-2 text-xs sm:text-sm flex items-center justify-between">
        <div className="flex items-center gap-4"><span>Sheet: {activeSheet}</span><span>|</span><span>Ready</span></div>
        <div className="flex items-center gap-4"><span>Zoom: {zoom}%</span><span>|</span><span>{highlightedCells.size} cells highlighted</span></div>
      </div>
    </Modal>
  );
}
