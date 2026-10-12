// Browser download helpers. No heavy imports so any feature can use them.
export const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Text -> file. A leading BOM in `text` is preserved (UTF-8). */
export const downloadText = (text, fileName, mime = 'text/plain;charset=utf-8') =>
  downloadBlob(new Blob([text], { type: mime }), fileName);
