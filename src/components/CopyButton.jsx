import { useEffect, useRef, useState } from 'react';
import Icons from './Icons.jsx';
import { Button } from '../features/ui-kit/index.js';
import { copyText } from '../utils/clipboard.js';
import { toTsv } from '../utils/serialize.js';

// Copy button: text from getText(), or a TSV from getRows() (aoa). Label flips to 'คัดลอกแล้ว' for 2 s.
// onCopied({ ok, text, rows }) fires after every attempt so the caller can log / show a manual-copy fallback.
export default function CopyButton({ getText, getRows, label = 'คัดลอก', onCopied, variant = 'secondary', size = 'md', className = '', disabled, ...rest }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const click = async () => {
    const rows = getRows ? getRows() : null;
    const text = rows ? toTsv(rows) : String(getText?.() ?? '');
    const res = await copyText(text); // inside the click handler so the user gesture is still valid
    if (res.ok) {
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 2000);
    }
    onCopied?.({ ...res, text, rows });
  };

  return (
    <>
      <Button variant={variant} size={size} Icon={done ? Icons.Check : Icons.Copy} onClick={click} disabled={disabled} className={className} {...rest}>
        {done ? 'คัดลอกแล้ว' : label}
      </Button>
      <span className="sr-only" aria-live="polite">{done ? 'คัดลอกแล้ว' : ''}</span>
    </>
  );
}
