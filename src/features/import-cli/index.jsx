import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { lazyComponent } from '../lazy.js';
import { canPickFolder, planFolderImport, scanDirectory } from './folder.js';
import { expandFile } from './intake.js';

const FolderImportModal = lazyComponent(() => import('./FolderImportModal.jsx'));

const ID = 'import-cli';
export const FOLDER_BUTTON_LABEL = 'เปิดโฟลเดอร์เดือนนี้ (ทดลอง – Chrome/Edge)';

const pickFolder = async (ctx) => {
  try {
    const dir = await window.showDirectoryPicker({ mode: 'read' });
    const { listSheetNames } = await import('../../lib/excel/index.js');
    const entries = await scanDirectory(dir, { listSheetNames });
    ctx.actions.setFeatureData(ID, { plan: planFolderImport(entries), folderName: dir.name });
  } catch (err) {
    if (err?.name === 'AbortError') return; // the user closed the picker
    ctx.actions.setError('เปิดโฟลเดอร์ไม่ได้ — ลองใหม่ หรือลากไฟล์มาวางในหน้าอัปโหลดแทน');
  }
};

// Intake feature without a tab:
//  - expandFiles: addSourceFiles accepts .zip / .eml (.msg gets a Thai "not supported" message)
//  - headerActions: folder picker button, rendered only where window.showDirectoryPicker exists
export default defineFeature({
  id: ID,
  order: 15,
  group: 'core',
  description: 'นำเข้าไฟล์จาก .zip / .eml / โฟลเดอร์',
  expandFiles: (file) => expandFile(file),
  headerActions: (ctx) => (canPickFolder()
    ? [{ label: FOLDER_BUTTON_LABEL, Icon: Icons.Folder, onClick: () => pickFolder(ctx), priority: 3 }]
    : []),
  slots: {
    banner: (ctx) => {
      const plan = ctx.state.features?.[ID]?.plan;
      return plan ? (
        <FolderImportModal plan={plan} state={ctx.state} actions={ctx.actions} onClose={() => ctx.actions.setFeatureData(ID, { plan: null })} />
      ) : null;
    },
  },
});
