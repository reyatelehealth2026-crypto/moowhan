// Bundles { name, content } files into a .zip (JSZip is only loaded when this runs).
/** @param {{ name: string, content: string }[]} files  @returns {Promise<Uint8Array>} */
export const zipFiles = async (files) => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.name, f.content));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};
