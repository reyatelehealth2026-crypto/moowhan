import { useMemo, useRef } from 'react';
import { compareRevisions, fileMetaParts, findDuplicateFiles, resolveNewer } from './logic.js';

const chip = 'px-2 py-0.5 rounded-md text-xs';
const btn = 'px-2 py-1 min-h-[32px] rounded-md text-xs border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40';

/**
 * Metadata chips + duplicate / old-revision warnings for one source file (rendered inside the upload tab file row).
 * Props: { file, files, actions, disabled }
 */
export default function FileCard({ file, files = [], actions, disabled = false }) {
  const input = useRef(null);
  const dup = useMemo(() => findDuplicateFiles(files).find((d) => d.id === file.id), [files, file.id]);
  const old = useMemo(() => compareRevisions(files).find((o) => o.id === file.id), [files, file.id]);
  const parts = fileMetaParts(file);
  const other = dup ? files.find((f) => f.id === dup.duplicateOfId) : null;
  const newerOfDup = other ? resolveNewer(file, other) : null;

  return (
    <div className="mt-1 space-y-1" data-testid="file-card">
      {parts.length > 0 && <p data-testid="file-meta" className="text-xs text-slate-500 break-words">{parts.join(' · ')}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {dup && (
          <>
            <span data-testid="chip-dup" className={`${chip} bg-red-100 text-red-700 max-w-full break-all`}>ซ้ำกับ {dup.duplicateOf}</span>
            <button type="button" disabled={disabled} onClick={() => actions.removeSourceFile?.(file.id)} className={btn}>ลบไฟล์นี้</button>
            {other && <button type="button" disabled={disabled} onClick={() => actions.useNewerFile?.(file.id, other.id)} className={btn}>ใช้ไฟล์ใหม่กว่า{newerOfDup === file ? ' (ไฟล์นี้)' : ''}</button>}
          </>
        )}
        {old && (
          <>
            <span data-testid="chip-old" className={`${chip} bg-amber-100 text-amber-700 max-w-full break-all`}>Rev เก่ากว่า {old.newerName}</span>
            <button type="button" disabled={disabled} onClick={() => actions.useNewerFile?.(file.id, old.newerId)} className={btn}>ใช้ไฟล์ใหม่กว่า</button>
          </>
        )}
        {actions.replaceSourceFile && (
          <>
            <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={btn}>แทนที่ไฟล์</button>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              aria-label={`เลือกไฟล์ใหม่แทน ${file.name}`}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) actions.replaceSourceFile(file.id, f); e.target.value = ''; }}
            />
          </>
        )}
      </div>
    </div>
  );
}
