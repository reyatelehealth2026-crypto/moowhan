import { useState } from 'react';
import InfoTip from '../../components/InfoTip.jsx';

// Glossary text is fetched on first open so it stays out of the entry chunk.
export default function GlossaryTip({ glossaryKey, monthLabels, label }) {
  const [text, setText] = useState('กำลังโหลด…');
  const load = () => import('./glossary.js').then((g) => setText(g.tipText(g.getEntry(glossaryKey), { monthLabels }) || 'ไม่พบคำอธิบาย'));
  return <InfoTip label={label || 'คำอธิบาย'} content={text} onOpen={load} />;
}
