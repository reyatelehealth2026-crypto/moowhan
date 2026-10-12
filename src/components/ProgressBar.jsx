import Icons from './Icons.jsx';

// Thin progress bar with a status line, shown while files are being processed.
export default function ProgressBar({ current, total, status }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-sm" aria-live="polite">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-5 h-5 text-blue-600"><Icons.Refresh /></span>
        <span className="text-sm text-slate-700 flex-1 truncate">{status}</span>
        <span className="text-sm font-semibold text-blue-700 tabular-nums">{current}/{total}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
