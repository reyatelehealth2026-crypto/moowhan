// The only module in the app that calls fetch(): same-origin, relative URLs.
// Sample files come from `node scripts/make-fixtures.mjs samples` (synthetic data only).
const BASE = 'samples/';

export const demoNotice = (productionMonth) =>
  `กำลังใช้ข้อมูลตัวอย่าง (เดือนผลิต ${productionMonth || '-'}) - ตัวเลขเป็นข้อมูลสังเคราะห์ กดรีเซ็ตเพื่อใช้ไฟล์จริง`;

const getFile = async (name) => {
  const res = await fetch(`${BASE}${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new File([await res.blob()], name);
};

/**
 * Loads the bundled demo into the app. Processing is deferred to the StepStrip (it runs once the
 * new file list has been committed to state). Never throws: failures become a Thai notice.
 * @returns {Promise<boolean>}
 */
export async function loadSamples(actions) {
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    if (!manifest?.demo || !Array.isArray(manifest.sources) || !manifest.sources.length) throw new Error('manifest ไม่ถูกต้อง');
    const sources = await Promise.all(manifest.sources.map(getFile));
    const template = manifest.template ? await getFile(manifest.template) : null;
    actions.clearSourceFiles?.();
    if (template) await actions.setTemplateFile(template);
    actions.setDemo?.(true);
    actions.addSourceFiles(sources);
    actions.setFeatureData('onboarding', { autoProcess: true, demoNotice: demoNotice(manifest.productionMonth) });
    return true;
  } catch {
    actions.setNotice('ไม่พบข้อมูลตัวอย่าง กรุณาอัปโหลดไฟล์จริงแทน หรือแจ้งผู้ดูแลระบบ');
    return false;
  }
}
