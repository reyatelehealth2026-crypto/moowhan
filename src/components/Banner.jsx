import Icons from './Icons.jsx';

const TONES = {
  error: { box: 'bg-red-50 border-red-200', icon: 'text-red-500', text: 'text-red-700', Icon: Icons.Alert },
  warning: { box: 'bg-amber-50 border-amber-200', icon: 'text-amber-500', text: 'text-amber-800', Icon: Icons.Info },
  success: { box: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-500', text: 'text-emerald-800', Icon: Icons.Check },
};

// Dismissible message strip. `message` may contain newlines.
export default function Banner({ tone = 'error', message, onDismiss }) {
  if (!message) return null;
  const t = TONES[tone] || TONES.error;
  return (
    <div className={`mb-6 p-4 border rounded-xl flex items-start gap-3 ${t.box}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={`w-6 h-6 flex-shrink-0 ${t.icon}`}><t.Icon /></span>
      <span className={`flex-1 whitespace-pre-line text-sm sm:text-base ${t.text}`}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className={`${t.text} opacity-60 hover:opacity-100 text-lg leading-none px-1`} aria-label="ปิดข้อความ">✕</button>
      )}
    </div>
  );
}
