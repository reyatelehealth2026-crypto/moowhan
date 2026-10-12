import { useMemo, useState } from 'react';
import Icons from './Icons.jsx';
import { PLANTS, PLANT_META } from '../constants.js';
import { DataGrid, STRINGS, GLOSSARY, Button } from '../features/ui-kit/index.js';

// ==================== PREVIEW TAB ("ตรวจสอบข้อมูล") ====================
export default function PreviewTab({ state, actions, monthLabels }) {
  const { processedData, sourceFiles, template, fileCounts } = state;
  const [plant, setPlant] = useState('all');

  const allRows = useMemo(() => {
    const out = [];
    Object.entries(processedData || {}).forEach(([sheet, rows]) => {
      const p = sheet.split(' ')[0];
      rows.forEach((r) => out.push({ ...r, plant: p, sheet }));
    });
    return out;
  }, [processedData]);
  const rows = useMemo(() => (plant === 'all' ? allRows : allRows.filter((r) => r.plant === plant)), [allRows, plant]);

  const columns = useMemo(() => [
    { key: 'partNumber', label: GLOSSARY.partNumber, className: 'font-mono text-blue-600' },
    { key: 'plant', label: 'Plant', render: (r) => <span className={`px-2 py-0.5 rounded text-xs ${PLANT_META[r.plant]?.badge || ''}`}>{r.plant}</span>, value: (r) => r.plant },
    { key: 'partCode', label: GLOSSARY.partCode, className: 'font-mono text-xs text-slate-600' },
    { key: 'dockCode', label: GLOSSARY.dockCode, className: 'text-xs text-slate-500' },
    { key: 'packingSize', label: GLOSSARY.packingSize, num: true, className: 'text-slate-500' },
    ...['n', 'n1', 'n2', 'n3'].map((k, i) => ({ key: k, label: monthLabels?.[i] || GLOSSARY[k], num: true })),
  ], [monthLabels]);

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
          toolbar={segment}
          emptyMessage={STRINGS.empty.noRows}
        />
      </div>
    </div>
  );
}
