import { defineFeature } from '../defineFeature.js';
import ExportGateHost from './ExportGateHost.jsx';

// Export dialog + gate + post-export check. The gate rules live in gate.js and are collected by App.jsx
// (runtime.collectGate + buildGate) when the user downloads; the dialog only opens for block/confirm issues.
// Other features add their own issues through validate() / beforeExport() — never by importing this feature.
export default defineFeature({
  id: 'export-gate',
  order: 48,
  group: 'core',
  description: 'หน้าต่างส่งออก ด่านตรวจก่อนดาวน์โหลด และตรวจไฟล์หลังส่งออก',
  slots: {
    banner: (ctx) => <ExportGateHost ctx={ctx} />,
  },
});
