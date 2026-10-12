// Where the finished workbook goes: the browser download (default) or a folder the user picked
// (File System Access API: Chrome/Edge). The folder target never overwrites: a taken name becomes _v2, _v3 ...
// Pure store + small browser calls; the dialog and flow.js read it, nothing else does.
import { canPickFolder, writeNoOverwrite } from '../import-cli/folder.js';

export const canSaveToFolder = canPickFolder;

let target = { kind: 'download', handle: null, name: '' };
const listeners = new Set();
const set = (next) => { target = { ...target, ...next }; listeners.forEach((l) => l()); };

export const saveTarget = {
  get: () => target,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  useDownload: () => set({ kind: 'download' }),
  /** Opens the folder picker (must run inside a click). Returns true when a folder was chosen. */
  async pickFolder(picker = (opts) => window.showDirectoryPicker(opts)) {
    try {
      const handle = await picker({ mode: 'readwrite' });
      set({ kind: 'folder', handle, name: handle.name || '' });
      return true;
    } catch (err) {
      if (err?.name !== 'AbortError') throw err; // the user closing the picker is not an error
      return false;
    }
  },
  reset: () => set({ kind: 'download', handle: null, name: '' }),
};

const writable = async (handle) => {
  const opts = { mode: 'readwrite' };
  if (handle.queryPermission && (await handle.queryPermission(opts)) === 'granted') return true;
  if (handle.requestPermission) return (await handle.requestPermission(opts)) === 'granted';
  return true;
};

/** -> { ok: true, name } | { ok: false, error } (never throws) */
export const saveBlobToFolder = async (handle, fileName, blob) => {
  try {
    if (!(await writable(handle))) return { ok: false, error: 'ไม่ได้รับอนุญาตให้เขียนลงโฟลเดอร์' };
    const name = await writeNoOverwrite(handle, fileName, new Uint8Array(await blob.arrayBuffer()));
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: err?.message || 'เขียนไฟล์ไม่สำเร็จ' };
  }
};

/** options for actions.downloadLastExport(): saves into the chosen folder, or {} for a normal download */
export const deliveryOptions = (t = target) => (t.kind === 'folder' && t.handle
  ? { folderName: t.name, saveTo: (last) => saveBlobToFolder(t.handle, last.fileName, last.blob) }
  : {});
