import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { lazyComponent } from '../lazy.js';

const SettingsPanel = lazyComponent(() => import('./SettingsPanel.jsx'));

// The one settings tab. The profile itself lives in useConsolidator (state.profile / actions.setProfile,
// replaceProfile, resetProfile); other features read it through ctx.profile and the pure helpers
// in ./calendar.js and ./profile.js.
export default defineFeature({
  id: 'settings-profile',
  order: 95,
  group: 'ตั้งค่า',
  description: 'ตั้งค่าโปรไฟล์ ชื่อไฟล์ส่งออก และปฏิทินวันทำงาน',
  tab: {
    label: 'ตั้งค่า',
    Icon: Icons.Settings,
    Component: SettingsPanel,
  },
});
