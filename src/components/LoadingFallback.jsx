/** Shown while a lazily loaded tab / panel chunk is being fetched (inside FeatureErrorBoundary). */
export default function LoadingFallback({ label = 'กำลังโหลด…' }) {
  return (
    <div role="status" aria-live="polite" className="py-10 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}
