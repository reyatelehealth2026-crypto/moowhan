import Icons from './Icons.jsx';

const TONES = {
  error: { box: 'bg-red-50 border-red-200', icon: 'text-red-500', text: 'text-red-700', Icon: Icons.Alert },
  warning: { box: 'bg-amber-50 border-amber-200', icon: 'text-amber-500', text: 'text-amber-800', Icon: Icons.Info },
  success: { box: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-500', text: 'text-emerald-800', Icon: Icons.Check },
};

// Dismissible message strip. `message` may contain newlines, or be an object
// { title, cause, fix, actions: [{label, onClick}], helpKey, technical } (see src/lib/errors.js).
// `actions` (same shape) adds buttons under any message.
export default function Banner({ tone = 'error', message, onDismiss, actions }) {
  if (!message) return null;
  const t = TONES[tone] || TONES.error;
  const rich = typeof message === 'object';
  const buttons = [...(rich ? message.actions || [] : []), ...(actions || [])];
  return (
    <div className={`mb-6 p-4 border rounded-xl flex items-start gap-3 ${t.box}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={`w-6 h-6 flex-shrink-0 ${t.icon}`}><t.Icon /></span>
      <div className={`flex-1 min-w-0 text-sm sm:text-base ${t.text}`}>
        {rich ? (
          <>
            <p className="font-semibold">{message.title}</p>
            {message.cause && <p>{message.cause}</p>}
            {message.fix && <p>{message.fix}</p>}
            {message.technical && (
              <details className="mt-1 text-xs opacity-80"><summary className="cursor-pointer">รายละเอียดทางเทคนิค</summary><span className="break-all">{message.technical}</span></details>
            )}
          </>
        ) : <span className="whitespace-pre-line break-words">{message}</span>}
        {buttons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {buttons.map((b) => (
              <button key={b.label} type="button" onClick={b.onClick} className="px-3 py-1.5 min-h-[36px] rounded-lg bg-white/70 hover:bg-white border border-current text-sm">{b.label}</button>
            ))}
          </div>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className={`${t.text} opacity-60 hover:opacity-100 text-lg leading-none px-1`} aria-label="ปิดข้อความ">✕</button>
      )}
    </div>
  );
}
