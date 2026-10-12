// Pure zip intake: expands a .zip into its .xls/.xlsx entries. No DOM/React; JSZip is loaded lazily
// through the Excel barrel so the first paint stays light.
export const ZIP_LIMITS = { maxEntries: 200, maxInflatedBytes: 50 * 1024 * 1024 };

const SOURCE_EXT = /\.(xls|xlsx)$/i;

export const baseName = (name) => String(name || '').split(/[\\/]/).filter(Boolean).pop() || '';
const isJunk = (path) => /(^|[\\/])__MACOSX[\\/]/.test(path) || baseName(path).startsWith('._');

const defaultLoader = async () => (await import('../../lib/excel/index.js')).loadZipLib();

const refuse = (message) => ({ files: [], skipped: [], error: message });

/**
 * expandZip(buf, { loadZipLib, depth }) -> { files:[{name, bytes, lastModified}], skipped:[{name, reason}], error? }
 * Limits: 200 entries, 50 MB inflated (counted while inflating). Over a limit => error + no files.
 * One nesting level: an inner .zip is skipped with a warning (depth >= 1 skips every nested zip).
 */
export async function expandZip(buf, { loadZipLib = defaultLoader, limits = ZIP_LIMITS } = {}) {
  let zip;
  try {
    const JSZip = await loadZipLib();
    zip = await JSZip.loadAsync(buf);
  } catch {
    return refuse('เปิดไฟล์ .zip ไม่ได้ – ไฟล์อาจเสียหาย ลองบีบอัดใหม่แล้วลากมาวางอีกครั้ง');
  }
  const entries = Object.values(zip.files);
  if (entries.length > limits.maxEntries) {
    return refuse(`ไฟล์ .zip มี ${entries.length} รายการ เกินกำหนด ${limits.maxEntries} รายการ – ไม่นำเข้าไฟล์ใดเลย`);
  }
  const files = [];
  const skipped = [];
  let inflated = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const name = baseName(entry.name);
    if (isJunk(entry.name)) { skipped.push({ name: name || entry.name, reason: 'ไฟล์ระบบของ macOS' }); continue; }
    if (/\.zip$/i.test(name)) { skipped.push({ name, reason: 'zip ซ้อน zip (รองรับชั้นเดียว)' }); continue; }
    if (!SOURCE_EXT.test(name)) { skipped.push({ name, reason: 'ไม่ใช่ไฟล์ .xls/.xlsx' }); continue; }
    const declared = entry._data?.uncompressedSize;
    if (Number.isFinite(declared) && inflated + declared > limits.maxInflatedBytes) {
      return refuse('ขนาดไฟล์หลังแตก .zip เกิน 50 MB – ไม่นำเข้าไฟล์ใดเลย');
    }
    const bytes = await entry.async('uint8array');
    inflated += bytes.byteLength;
    if (inflated > limits.maxInflatedBytes) return refuse('ขนาดไฟล์หลังแตก .zip เกิน 50 MB – ไม่นำเข้าไฟล์ใดเลย');
    files.push({ name, bytes, lastModified: entry.date ? entry.date.getTime() : Date.now() });
  }
  return { files, skipped };
}
