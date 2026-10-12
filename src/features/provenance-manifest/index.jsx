import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { isoNow } from '../../utils/clock.js';
import { lazyComponent } from '../lazy.js';
import { FEATURE_ID } from './meta.js';
import { dataSignature, isStaleSent, sentChipText } from './sent.js';

const ProvenanceHost = lazyComponent(() => import('./ProvenanceHost.jsx'));
const data = (ctx) => ctx.state.features?.[FEATURE_ID] || {};

// No top-level tab: the manifest opens as a dialog from the header; sign-off prompts are a banner slot.
export default defineFeature({
  id: FEATURE_ID,
  order: 62,
  group: 'ตรวจสอบ',
  description: 'Manifest รอบรัน ตราประทับที่มา และส่งแล้ว',
  headerActions: (ctx) => {
    const feat = data(ctx);
    const actions = [{
      label: feat.sent ? sentChipText(feat.sent, { stale: isStaleSent(feat.sent, dataSignature(ctx.state)) }) : 'Manifest รอบรัน',
      Icon: feat.sent ? Icons.Check : Icons.History,
      priority: 1,
      onClick: () => ctx.actions.setFeatureData(FEATURE_ID, { open: true }),
    }];
    return ctx.state.processedData ? actions : [];
  },
  exportSheets: async (ctx) => {
    if (!ctx.state.processedData || data(ctx).runInfo === false || ctx.state.profile?.features?.[FEATURE_ID]?.runInfo === false) return [];
    const { buildManifest, manifestToAoa } = await import('./manifest.js');
    return [{ name: 'Run Info', aoa: manifestToAoa(buildManifest(ctx.state)) }];
  },
  onExported: (ctx, result) => {
    ctx.actions.setFeatureData(FEATURE_ID, {
      lastExport: { fileName: result.fileName, sha256: result.report?.sha256 || 'n/a', at: isoNow(), signature: dataSignature(ctx.state) },
      promptDismissed: false,
    });
  },
  slots: { banner: (ctx) => <ProvenanceHost ctx={ctx} /> },
});
