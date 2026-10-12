import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { lazyComponent } from '../lazy.js';

const StepStrip = lazyComponent(() => import('./StepStrip.jsx'));

export default defineFeature({
  id: 'onboarding',
  order: 10,
  group: 'core',
  description: 'แถบขั้นตอนการใช้งานและข้อมูลตัวอย่าง',
  headerActions: ({ state, actions }) =>
    state.sourceFiles.length === 0 && !state.processedData
      ? [{ label: 'ลองข้อมูลตัวอย่าง', Icon: Icons.Play, priority: 5, onClick: async () => { const { loadSamples } = await import('./loadSamples.js'); await loadSamples(actions); } }]
      : [],
  slots: {
    banner: ({ state, actions }) => <StepStrip state={state} actions={actions} />,
  },
});
