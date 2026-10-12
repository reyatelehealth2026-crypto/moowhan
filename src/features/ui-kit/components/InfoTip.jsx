import { useId, useState } from 'react';
import Icons from '../../../components/Icons.jsx';

/** Small (i) that shows help on hover, focus or tap. */
export default function InfoTip({ text, label = 'คำอธิบาย' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className="w-5 h-5 text-slate-400 hover:text-slate-600"
      ><Icons.Info /></button>
      {open && (
        <span id={id} role="tooltip" className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 w-56 max-w-[70vw] bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg">{text}</span>
      )}
    </span>
  );
}
