import Icons from './Icons.jsx';
import FileDropZone from './FileDropZone.jsx';
import ProgressBar from './ProgressBar.jsx';
import { PLANTS, PLANT_META } from '../constants.js';
import { STRINGS } from '../features/ui-kit/strings.js';
import { formatSize } from '../utils/format.js';

const STATUS_ICON = {
  done: 'text-emerald-500',
  error: 'text-red-500',
  processing: 'text-blue-500',
  ready: 'text-slate-400',
};

// ==================== UPLOAD TAB ====================
export default function UploadTab({ state, actions }) {
  const { template, sourceFiles, processing, fileCounts } = state;
  const canProcess = sourceFiles.length > 0 && !processing.active;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Template */}
      <div className="lg:col-span-1">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-full shadow-sm flex flex-col">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-5 h-5 text-amber-500"><Icons.File /></span>ไฟล์หลัก (Template)
          </h2>
          <FileDropZone
            accept=".xlsx,.xls"
            onFiles={(files) => actions.setTemplateFile(files[0])}
            disabled={processing.active}
            className={`block border-2 border-dashed rounded-xl p-6 text-center transition-all ${template ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}
            activeClassName="border-blue-500 bg-blue-100"
          >
            {template ? (
              <div className="flex flex-col items-center gap-3">
                <span className="w-12 h-12 text-blue-600"><Icons.Check /></span>
                <div className="min-w-0 w-full">
                  <p className="font-medium truncate" title={template.name}>{template.name}</p>
                  <p className="text-sm text-slate-500">{formatSize(template.size)} • {template.sheets.length} sheets</p>
                </div>
                {template.kind === 'xlsx' ? (
                  <span className="px-2 py-1 rounded-lg text-xs bg-emerald-100 text-emerald-700">เขียนลงเทมเพลตโดยตรง (รักษา pivot/สูตร/ฟอร์แมต)</span>
                ) : (
                  <span className="px-2 py-1 rounded-lg text-xs bg-amber-100 text-amber-700">.xls: จะสร้างไฟล์ใหม่ (คัดลอกค่าเท่านั้น)</span>
                )}
              </div>
            ) : (
              <>
                <span className="w-12 h-12 mx-auto text-slate-400 block mb-3"><Icons.Upload /></span>
                <p className="text-slate-600 mb-1">ลากไฟล์มาวางหรือคลิกเลือกไฟล์หลัก</p>
                <p className="text-sm text-slate-400">.xlsx (แนะนำ) หรือ .xls</p>
              </>
            )}
          </FileDropZone>
          {template ? (
            <button onClick={actions.removeTemplate} className="mt-3 text-xs text-slate-400 hover:text-red-500 self-center flex items-center gap-1">
              <span className="w-3.5 h-3.5"><Icons.Trash /></span>นำไฟล์หลักออก
            </button>
          ) : (
            <p className="text-xs text-slate-400 mt-3 text-center">* ไม่จำเป็นต้องมี: ถ้าไม่ใส่ ระบบจะสร้างไฟล์สรุปใหม่ให้</p>
          )}
        </div>
      </div>

      {/* Source files */}
      <div className="lg:col-span-2">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-5 h-5 text-blue-600"><Icons.Chart /></span>ไฟล์ข้อมูลรายโรงงาน
          </h2>
          <FileDropZone
            accept=".xlsx,.xls"
            multiple
            onFiles={actions.addSourceFiles}
            disabled={processing.active}
            className="block border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50 transition-all mb-4"
            activeClassName="border-blue-500 bg-blue-100"
          >
            {({ dragging }) => (
              <>
                <span className="w-10 h-10 mx-auto text-blue-400 block mb-2"><Icons.Upload /></span>
                <p className="text-slate-600 mb-1">{dragging ? 'ปล่อยไฟล์ได้เลย' : 'ลากไฟล์มาวางหรือคลิกเลือก (เลือกได้หลายไฟล์)'}</p>
                <p className="text-sm text-slate-400">ชื่อไฟล์ขึ้นต้นด้วย BP, BPK, GW หรือ SR</p>
              </>
            )}
          </FileDropZone>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {PLANTS.map((plant) => (
              <div key={plant} className={`p-3 rounded-xl border-2 ${PLANT_META[plant].border} ${PLANT_META[plant].lightBg} text-center`}>
                <div className={`text-sm font-bold ${PLANT_META[plant].iconColor}`}>{plant}</div>
                <div className="text-2xl font-bold">{fileCounts[plant]}</div>
                <div className="text-xs text-slate-500">ไฟล์</div>
              </div>
            ))}
          </div>

          {sourceFiles.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-100 rounded-xl p-2">
              {sourceFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 sm:px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-5 h-5 flex-shrink-0 ${STATUS_ICON[file.status] || STATUS_ICON.ready}`}>
                      {file.status === 'done' ? <Icons.Check /> : file.status === 'processing' ? <Icons.Refresh /> : file.status === 'error' ? <Icons.Alert /> : <Icons.File />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {formatSize(file.size)}
                        {file.rowCount > 0 && ` • ${file.rowCount} แถว`}
                        {file.meta?.productionMonthRaw && ` • เดือน ${file.meta.productionMonthRaw}`}
                        {file.error && <span className="text-red-500"> • {file.error}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${PLANT_META[file.category].badge}`}>{file.category}</span>
                    <button onClick={() => actions.removeSourceFile(file.id)} disabled={processing.active} className="w-5 h-5 text-slate-400 hover:text-red-500 disabled:opacity-40" aria-label={`ลบ ${file.name}`}>
                      <Icons.Trash />
                    </button>
                  </div>
                </div>
              ))}
              {sourceFiles.length > 1 && (
                <button onClick={actions.clearSourceFiles} disabled={processing.active} className="w-full text-xs text-slate-400 hover:text-red-500 py-1">ลบไฟล์ทั้งหมด</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        {processing.active && <ProgressBar current={processing.current} total={processing.total} status={processing.status} />}
        <button
          onClick={actions.processAll}
          data-testid="process"
          disabled={!canProcess}
          className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
            canProcess ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
        >
          <span className="w-6 h-6">{processing.active ? <Icons.Refresh /> : <Icons.Play />}</span>
          {processing.active ? STRINGS.status.processing : STRINGS.buttons.process}
        </button>
      </div>
    </div>
  );
}
