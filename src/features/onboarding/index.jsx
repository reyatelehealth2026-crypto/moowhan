import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import StepStrip from './StepStrip.jsx';
import { loadSamples } from './loadSamples.js';

export default defineFeature({
  id: 'onboarding',
  order: 10,
  group: 'core',
  description: 'แถบขั้นตอนการใช้งานและข้อมูลตัวอย่าง',
  headerActions: ({ state, actions }) =>
    state.sourceFiles.length === 0 && !state.processedData
      ? [{ label: 'ลองข้อมูลตัวอย่าง', Icon: Icons.Play, priority: 5, onClick: () => loadSamples(actions) }]
      : [],
  slots: {
    banner: ({ state, actions }) => <StepStrip state={state} actions={actions} />,
  },
});
