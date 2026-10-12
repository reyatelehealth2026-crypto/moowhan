import { defineFeature } from '../defineFeature.js';
import { lazyComponent } from '../lazy.js';
import './rules.js'; // registers D01-D04 / F01 into the qa-engine

const ExpectedFilesCard = lazyComponent(() => import('./ExpectedFilesCard.jsx'));

// qa-file-guards: duplicate files, old revisions and expected-file checks for the intake step.
// All warnings go through the qa-engine (tab, badge, QA Report); this feature adds only the upload-tab panel.
// File chips live in FileCard.jsx (used by UploadTab); Firm/FC tags in HorizonBadge.jsx (Summary/Preview).
export default defineFeature({
  id: 'qa-file-guards',
  order: 70,
  description: 'ตรวจไฟล์ซ้ำ revision เก่า และไฟล์ที่ขาดเทียบรอบก่อน',
  slots: {
    uploadPanel: (ctx) => <ExpectedFilesCard sourceFiles={ctx.state.sourceFiles} />,
  },
});
