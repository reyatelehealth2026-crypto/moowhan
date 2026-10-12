import { defineFeature } from '../defineFeature.js';
import StorageHost from './StorageHost.jsx';
import StoragePanel from './StoragePanel.jsx';

// No tab: StorageHost (banner slot) is mounted for the whole app run and owns the effects
// (hydrate, autosave, restore banner); StoragePanel is the "ข้อมูลที่เก็บในเครื่องนี้" section on the upload tab.
// Other features must never touch the browser storage APIs: use src/lib/storage (registerKey + getStorage).
export default defineFeature({
  id: 'storage-session',
  order: 49,
  group: 'core',
  description: 'จำไฟล์หลักและบันทึกงานค้างไว้ในเครื่องนี้ (ต้องเปิดเอง) เพื่อกู้คืนภายหลัง',
  slots: {
    banner: (ctx) => <StorageHost ctx={ctx} />,
    uploadPanel: (ctx) => <StoragePanel ctx={ctx} />,
  },
});
