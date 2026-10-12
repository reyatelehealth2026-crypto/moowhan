export default function KpiCard({ label, value, delta, className = '' }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-3 sm:p-4 ${className}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="num text-xl sm:text-2xl font-bold">{value}</p>
      {delta != null && <p className="num text-sm text-slate-500">{delta}</p>}
    </div>
  );
}
