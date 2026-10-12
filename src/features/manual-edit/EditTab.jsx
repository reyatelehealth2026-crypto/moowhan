import { Fragment, useEffect, useMemo, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import { MONTH_KEYS, PLANTS, PLANT_META } from '../../constants.js';
import { Button, STRINGS, GLOSSARY } from '../ui-kit/index.js';
import { formatNumber } from '../../utils/format.js';
import { ID, calendarOf, featureData, runEdit, undoLast } from './controller.js';
import DayMoveDialog from './DayMoveDialog.jsx';
import EditBar from './EditBar.jsx';
import EditableCell from './EditableCell.jsx';
import PastePanel from './PastePanel.jsx';
import { editKey } from './edits.js';
import { editUndo } from './undo.js';

const PAGE = 200;
const isField = (t) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(t?.tagName).toUpperCase()) || !!t?.isContentEditable;

// ==================== TAB "แก้ไขตัวเลข" ====================
export default function EditTab({ state, actions, monthLabels }) {
  const { processedData } = state;
  const ctx = { state, actions, monthLabels };
  const data = featureData(state);
  const calendar = calendarOf(state);

  const [plant, setPlant] = useState('all');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(null); // { rowKey, field }
  const [drafts, setDrafts] = useState({}); // rowKey -> { n?: number, ... } waiting for "บันทึก"
  const [moveRow, setMoveRow] = useState(null);

  const allRows = useMemo(() => {
    const out = [];
    Object.entries(processedData || {}).forEach(([sheet, rows]) => rows.forEach((r) => out.push({ ...r, plant: sheet.split(' ')[0], sheet, rowKey: `${sheet}-${r.id}` })));
    return out;
  }, [processedData]);
  const editedCount = useMemo(() => allRows.filter((r) => r.edited).length, [allRows]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => (plant === 'all' || r.plant === plant) && (!onlyEdited || r.edited || drafts[r.rowKey])
      && (!q || `${r.partNumber} ${r.partCode} ${r.dockCode}`.toLowerCase().includes(q)));
  }, [allRows, plant, onlyEdited, query, drafts]);
  const shown = rows.slice(0, limit);
  const reasonOf = useMemo(() => new Map(data.ledger.map((e) => [e.key, e.reason])), [data.ledger]);

  useEffect(() => { setLimit(PAGE); }, [plant, onlyEdited, query]);

  // Ctrl/Cmd+Z undoes the last save only while its toast is still visible and no field has focus
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== 'z') return;
      if (!editUndo.has() || isField(e.target)) return;
      e.preventDefault();
      undoLast(actions);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  const setDraftValue = (row, field, value) => setDrafts((d) => {
    const patch = { ...(d[row.rowKey] || {}) };
    if (value === row[field]) delete patch[field]; else patch[field] = value;
    const next = { ...d };
    if (Object.keys(patch).length) next[row.rowKey] = patch; else delete next[row.rowKey];
    return next;
  });

  const commitCell = (row, field, value, dir) => {
    setDraftValue(row, field, value);
    if (!dir) { setEditing(null); return; }
    const order = shown.flatMap((r) => MONTH_KEYS.map((k) => ({ rowKey: r.rowKey, field: k })));
    const at = order.findIndex((o) => o.rowKey === row.rowKey && o.field === field);
    setEditing(order[at + dir] || null);
  };

  const save = (row, { strategy, reason }) => {
    const plan = runEdit(ctx, [{ sheet: row.sheet, rowId: row.id, kind: 'total', patch: drafts[row.rowKey], strategy, reason }]);
    if (plan?.applied) setDrafts((d) => { const n = { ...d }; delete n[row.rowKey]; return n; });
  };
  const revert = (row) => runEdit(ctx, [{ sheet: row.sheet, rowId: row.id, kind: 'revert' }], { message: 'คืนค่าเดิมแล้ว' });

  const segment = (
    <div role="group" aria-label="เลือกโรงงาน" className="flex flex-wrap gap-1">
      {['all', ...PLANTS].map((p) => (
        <button key={p} type="button" aria-pressed={plant === p} onClick={() => setPlant(p)}
          className={`px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border ${plant === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          {p === 'all' ? STRINGS.plants.all : p}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="manual-edit-tab">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p><span className="font-semibold">แก้ไขตัวเลขด้วยมือ:</span> ดับเบิลคลิกที่ N..N+3 (หรือกด Enter / F2) พิมพ์ตัวเลข แล้วเลือกเหตุผลก่อนบันทึก ระบบจะปรับยอดรายวันให้ผลรวมเท่ากับยอดใหม่ และเน้นเซลล์ที่แก้ไขด้วยสีเหลืองอำพันในไฟล์ที่ส่งออก</p>
      </div>

      <PastePanel processedData={processedData} ledger={data.ledger} onApply={(items, message) => runEdit(ctx, items, { message })} />

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b bg-slate-50 flex flex-wrap items-center gap-3">
          {segment}
          <button type="button" aria-pressed={onlyEdited} onClick={() => setOnlyEdited((v) => !v)} data-testid="only-edited"
            className={`px-3 py-2 min-h-[44px] rounded-lg text-sm border ${onlyEdited ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            เฉพาะที่แก้ไข{editedCount ? ` (${editedCount})` : ''}
          </button>
          <div className="relative flex-1 sm:flex-none sm:ml-auto min-w-[160px] sm:w-64">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"><Icons.Search /></span>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={STRINGS.search.placeholder} aria-label={STRINGS.search.placeholder}
              className="w-full pl-8 pr-3 py-2 min-h-[44px] border border-slate-200 rounded-lg text-sm bg-white" />
          </div>
        </div>

        {data.ledger.length > 0 && (
          <label className="flex items-center gap-2 px-4 sm:px-6 py-2 border-b text-sm text-slate-600 min-h-[44px]">
            <input type="checkbox" className="w-5 h-5" checked={data.exportLedger !== false} onChange={(e) => actions.setFeatureData(ID, { exportLedger: e.target.checked })} />
            ใส่ sheet “Manual Edits” (รายการแก้ไขและเหตุผล) ในไฟล์ที่ส่งออก
          </label>
        )}

        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th scope="col" className="sticky left-0 z-10 bg-slate-100 text-left px-3 py-2 font-semibold whitespace-nowrap">{GLOSSARY.partNumber}</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">Plant</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold whitespace-nowrap">{GLOSSARY.dockCode}</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold whitespace-nowrap">{GLOSSARY.packingSize}</th>
                {MONTH_KEYS.map((k, i) => <th key={k} scope="col" className="text-right px-3 py-2 font-semibold whitespace-nowrap">{monthLabels?.[i] || GLOSSARY[k]}</th>)}
                <th scope="col" className="text-left px-3 py-2 font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const draft = drafts[row.rowKey];
                const reason = reasonOf.get(editKey(row, row.plant));
                return (
                  <Fragment key={row.rowKey}>
                    <tr className={`${row.edited ? 'bg-amber-50/60' : 'bg-white'}`} data-testid="edit-row">
                      <td className={`sticky left-0 z-[1] border-b border-slate-100 px-3 py-1.5 font-mono text-blue-600 whitespace-nowrap ${row.edited ? 'bg-amber-50' : 'bg-white'}`}>
                        {row.partNumber}
                        {row.edited && <span className="ml-2 align-middle px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 text-amber-900 font-sans" data-testid="edited-chip" title={reason || undefined}>แก้ไขแล้ว</span>}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-1.5"><span className={`px-2 py-0.5 rounded text-xs ${PLANT_META[row.plant]?.badge || ''}`}>{row.plant}</span></td>
                      <td className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">{row.dockCode}</td>
                      <td className="border-b border-slate-100 px-3 py-1.5 text-right num text-slate-500">{formatNumber(row.packingSize)}</td>
                      {MONTH_KEYS.map((k, i) => {
                        const isEditing = editing?.rowKey === row.rowKey && editing.field === k;
                        const cellEdited = row.original && row.original[k] !== row[k];
                        return (
                          <td key={k} className="border-b border-slate-100 px-2 py-1 align-top">
                            <EditableCell
                              testId={`cell-${row.plant}-${row.partNumber}-${row.dockCode}-${k}`}
                              label={`${row.partNumber} ${monthLabels?.[i] || k}`}
                              value={row[k]}
                              pending={draft?.[k]}
                              packingSize={row.packingSize}
                              edited={cellEdited}
                              editing={isEditing}
                              onStart={() => setEditing({ rowKey: row.rowKey, field: k })}
                              onCommit={(v, dir) => commitCell(row, k, v, dir)}
                              onCancel={() => setEditing(null)}
                            />
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-100 px-2 py-1 whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setMoveRow(row)}>ย้ายยอดวัน</Button>
                        {row.edited && <Button variant="ghost" size="sm" Icon={Icons.Reset} onClick={() => revert(row)} data-testid="revert-row">คืนค่าเดิม</Button>}
                      </td>
                    </tr>
                    {draft && (
                      <tr>
                        <td colSpan={9} className="bg-slate-50 border-b border-slate-200 px-3 sm:px-6 py-3">
                          <div className="max-w-full"><EditBar row={row} patch={draft} calendar={calendar} onSave={(o) => save(row, o)} onCancel={() => setDrafts((d) => { const n = { ...d }; delete n[row.rowKey]; return n; })} /></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-8 text-center text-slate-500">{onlyEdited ? 'ยังไม่มีแถวที่แก้ไข' : STRINGS.empty.noRows}</p>}
        </div>
        {rows.length > shown.length && (
          <div className="p-3 text-center border-t"><Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>ดูเพิ่มอีก {Math.min(PAGE, rows.length - shown.length)} แถว (เหลือ {rows.length - shown.length})</Button></div>
        )}
      </div>

      {moveRow && (
        <DayMoveDialog
          row={moveRow}
          monthLabels={monthLabels}
          calendar={calendar}
          onClose={() => setMoveRow(null)}
          onSubmit={(move) => {
            const plan = runEdit(ctx, [{ ...move, sheet: moveRow.sheet, rowId: moveRow.id }]);
            if (plan?.applied) setMoveRow(null);
          }}
        />
      )}
    </div>
  );
}
