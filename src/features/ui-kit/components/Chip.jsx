const TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-700',
  success: 'bg-emerald-100 text-emerald-700',
};

export default function Chip({ tone = 'neutral', onDismiss, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${TONES[tone] || TONES.neutral} ${className}`}>
      {children}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="นำออก" className="-mr-1 w-5 h-5 leading-none rounded-full hover:bg-black/10">✕</button>
      )}
    </span>
  );
}
