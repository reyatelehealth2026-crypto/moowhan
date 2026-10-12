import { defineFeature } from '../defineFeature.js';
import RunHistoryPanel from './RunHistoryPanel.jsx';
import { accuracy, accuracyToAoa } from './accuracy.js';
import { FEATURE_ID } from './logic.js';
import { runStore } from './store.js';

// No tab: the panel renders in the upload tab's panel slot. Snapshots are written by onProcessed
// (from the ProcessResult, because the ctx may be stale) and patched by onExported.
export default defineFeature({
  id: FEATURE_ID,
  order: 91,
  group: 'ประวัติ',
  description: 'ประวัติการรัน แนวโน้ม และความแม่นยำของ forecast',
  onProcessed: async (ctx, result) => {
    await runStore.record({
      processedData: result.processedData,
      productionMonth: result.productionMonth,
      files: result.files,
      changeLog: ctx.state.changeLog,
    });
  },
  onExported: async (ctx, result) => {
    await runStore.patchLatest({
      export: { fileName: result.fileName, sha256: result.report?.sha256 || null, exportedAt: new Date().toISOString() },
      editsCount: (ctx.state.changeLog || []).filter((l) => l.action === 'edit').length,
    });
  },
  exportSheets: async () => {
    await runStore.init();
    const { prefs, runs } = runStore.snapshot();
    if (!prefs.accuracySheet) return [];
    return [{ name: 'FC Accuracy', aoa: accuracyToAoa(accuracy(runs, { level: 'plant' })) }];
  },
  slots: { uploadPanel: (ctx) => <RunHistoryPanel ctx={ctx} /> },
});
