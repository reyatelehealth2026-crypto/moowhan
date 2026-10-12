import { useEffect, useMemo, useState } from 'react';
import Icons from './Icons.jsx';
import { PLANTS, PLANT_META } from '../constants.js';
import HorizonBadge from '../features/qa-file-guards/HorizonBadge.jsx';
import { PART_TYPE_LABEL } from '../features/qa-file-guards/logic.js';
import { DataGrid, STRINGS, GLOSSARY, Button } from '../features/ui-kit/index.js';
import GlossaryTip from '../features/help-center/GlossaryTip.jsx';
import { COLUMN_TIPS } from '../features/help-center/columns.js';

// ==================== PREVIEW TAB ("ตรวจสอบข้อมูล") ====================
export default function PreviewTab({ state, actions, monthLabels }) {
  const { processedData, sourceFiles, template, fileCounts } = state;
  // qa-engine "ไปดูแถว": the QA tab leaves { query, plant } in state.features.preview; consume it once
  const [handoff] = useState(() => state.features?.preview || {});
  const [plant, setPlant] = useState(() => (PLANTS.includes(handoff.plant) ? handoff.plant : 'all'));
  useEffect(() => {
    if (handoff.query || handoff.plant) actions.setFeatureData?.('preview', { query: '', plant: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRows = useMemo(() => {
    const out = [];
    Object.entries(processedData || {}).forEach(([sheet, rows]) => {
      const p = sheet.split(' ')[0];
      rows.forEach((r) => out.push({ ...r, plant: p, sheet }));
    });
    return out;
  }, [processedData]);
  const [partType, setPartType] = useState('all'); // qa-file-guards: Vehicle / Packing filter
  const hasPartTypes = useMemo(() => allRows.some((r) => r.partType), [allRows]);
  const rows = useMemo(
    () => allRows.filter((r) => (plant === 'all' || r.plant === plant) && (partType === 'all' || r.partType === partType)),
    [allRows, plant, partType],
  );

  const columns = useMemo(() => [
    { key: 'partNumber', label: GLOSSARY.partNumber, className: 'font-mono text-blue-600' },
    { key: 'plant', label: 'Plant', render: (r) => <span className={`px-2 py-0.5 rounded text-xs ${PLANT_META[r.plant]?.badge || ''}`}>{r.plant}</span>, value: (r) => r.plant },
    { key: 'partCode', label: GLOSSARY.partCode, className: 'font-mono text-xs text-slate-600' },
    { key: 'dockCode', label: GLOSSARY.dockCode, className: 'text-xs text-slate-500', tip: <GlossaryTip glossaryKey={COLUMN_TIPS.dockCode} label="อธิบาย Dock" /> },
    { key: 'packingSize', label: GLOSSARY.packingSize, num: true, className: 'text-slate-500', tip: <GlossaryTip glossaryKey={COLUMN_TIPS.packingSize} label="อธิบาย Pack" /> },
    ...['n', 'n1', 'n2', 'n3'].map((k, i) => ({ key: k, label: <>{monthLabels?.[i] || GLOSSARY[k]}<HorizonBadge k={k} sourceFiles={sourceFiles} /></>, num: true, tip: k === 'n1' ? <GlossaryTip glossaryKey={COLUMN_TIPS.n1} monthLabels={monthLabels} label="อธิบาย N+1" /> : undefined })),
  ], [monthLabels, sourceFiles]);

  const missingPlants = PLANTS.filter((p) => fileCounts[p] === 0);
  const filesWithError = sourceFiles.filter((f) => f.status === 'error').length;
  const filesProcessed = sourceFiles.filter((f) => f.status === 'done').length;

  const segment = (
    <div role="group" aria-label="เลือกโรงงาน" className="flex flex-wrap gap-1">
      {['all', ...PLANTS].map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={plant === p}
          onClick={() => setPlant(p)}
          className={`px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border ${plant === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          {p === 'all' ? STRINGS.plants.all : p}
        </button>
      ))}
      {hasPartTypes && (
        <select
          aria-label="ชนิดชิ้นส่วน"
          data-testid="part-type-filter"
          value={partType}
          onChange={(e) => setPartType(e.target.value)}
          className="px-3 py-2 min-h-[44px] rounded-lg text-sm border border-slate-200 bg-white text-slate-600"
        >
          <option value="all">Vehicle + Packing</option>
          {Object.entries(PART_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h3 className="text-lg font-semibold text-emerald-900">ตรวจสอบข้อมูล</h3>
          <Button onClick={actions.openPreview} Icon={Icons.Eye} data-testid="preview-excel" className="!bg-emerald-600 hover:!bg-emerald-700">{STRINGS.buttons.previewExcel}</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/70 rounded-xl p-3"><p className="text-sm text-emerald-600">ไฟล์หลัก</p><p className="font-semibold">{template ? `✓ ${STRINGS.status.ready}` : STRINGS.status.missing}</p></div>
          <div className="bg-white/70 rounded-xl p-3"><p className="text-sm text-emerald-600">ประมวลผลสำเร็จ</p><p className="font-semibold num">{filesProcessed} / {sourceFiles.length}</p></div>
          <div className="bg-white/70 rounded-xl p-3"><p className="text-sm text-emerald-600">โรงงานขาด</p><p className={`font-semibold ${missingPlants.length ? 'text-amber-600' : ''}`}>{missingPlants.length > 0 ? missingPlants.join(', ') : STRINGS.status.complete}</p></div>
          <div className="bg-white/70 rounded-xl p-3"><p className="text-sm text-emerald-600">ข้อผิดพลาด</p><p className={`font-semibold ${filesWithError ? 'text-red-600' : ''}`}>{filesWithError > 0 ? `${filesWithError} ไฟล์` : 'ไม่มี'}</p></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <DataGrid
          testId="preview-grid"
          columns={columns}
          rows={rows}
          getKey={(r) => `${r.sheet}-${r.id}`}
          resetKey={processedData}
          initialQuery={handoff.query || ''}
          toolbar={segment}
          emptyMessage={STRINGS.empty.noRows}
        />
      </div>
    </div>
  );
}
