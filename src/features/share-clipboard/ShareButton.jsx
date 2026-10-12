import { useState } from 'react';
import Icons from '../../components/Icons.jsx';
import { Button } from '../ui-kit/index.js';
import ShareModal from './ShareModal.jsx';

/** 'แชร์สรุป' button + modal; placed in the SummaryTab button row. Disabled until there is summary data. */
export default function ShareButton({ state, actions, monthLabels, className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" variant="secondary" Icon={Icons.Share} disabled={!state.summaryData?.length} onClick={() => setOpen(true)} className={className} data-testid="share-summary">แชร์สรุป</Button>
      {open && <ShareModal state={state} actions={actions} monthLabels={monthLabels} onClose={() => setOpen(false)} />}
    </>
  );
}
