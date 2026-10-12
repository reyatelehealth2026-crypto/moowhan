import { HORIZON_META } from '../../constants.js';
import { horizonInfo } from './logic.js';

// Small Firm / FC tag next to the N..N+3 column titles (Summary, Preview).
// N: "Firm" when every file is forecastType F, otherwise "ประเภท forecast: X". N+1..N+3: "FC".
export default function HorizonBadge({ k, sourceFiles }) {
  const info = horizonInfo(sourceFiles);
  const meta = HORIZON_META.find((h) => h.key === k);
  if (!meta || !info.known) return null;
  let text; let tone;
  if (meta.kind === 'firm') {
    if (info.firm) { text = meta.badge; tone = 'bg-emerald-100 text-emerald-700'; }
    else { text = `ประเภท forecast: ${info.others.join(', ')}`; tone = 'bg-amber-100 text-amber-700'; }
  } else {
    text = meta.badge; tone = 'bg-slate-100 text-slate-500';
  }
  return <span data-testid={`horizon-${k}`} className={`ml-1 px-1.5 py-0.5 rounded text-[10px] leading-none font-medium align-middle whitespace-nowrap ${tone}`}>{text}</span>;
}
