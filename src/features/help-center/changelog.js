// Parse CHANGELOG.md (Keep-a-Changelog) into [{ version, date, items: [string] }]. Pure.
export const parseChangelog = (md) => {
  const out = [];
  let cur = null;
  String(md ?? '').split(/\r?\n/).forEach((line) => {
    const h = line.match(/^##\s+\[?([^\]\s]+)\]?(?:\s+-\s+(\S+))?/);
    if (h) { cur = { version: h[1], date: h[2] || '', items: [] }; out.push(cur); return; }
    const b = line.match(/^\s*[-*]\s+(.*\S)/);
    if (b && cur) cur.items.push(b[1]);
  });
  return out.filter((e) => /^\d/.test(e.version));
};
