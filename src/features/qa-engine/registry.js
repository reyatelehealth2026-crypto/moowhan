// Rule registry. A rule = { id, group, level, defaultOn, title, run(ctx) -> partial Issue[] }.
// Adding a rule: see README.md in this folder.
const rules = [];

export const registerRule = (rule) => {
  const problems = [];
  if (!rule || typeof rule !== 'object') problems.push('rule ต้องเป็นออบเจ็กต์');
  else {
    if (!/^[A-Z]{1,3}\d{2,3}$/.test(rule.id || '')) problems.push(`id "${rule.id}" ต้องเป็นรูป R01 / K03 / C01`);
    if (!['row', 'file', 'month', 'layout', 'consistency', 'template'].includes(rule.group)) problems.push(`group "${rule.group}" ไม่ถูกต้อง`);
    if (!['error', 'warning', 'info'].includes(rule.level)) problems.push(`level "${rule.level}" ไม่ถูกต้อง`);
    if (typeof rule.run !== 'function') problems.push('run ต้องเป็นฟังก์ชัน');
  }
  if (problems.length) throw new Error(`QA rule ไม่ถูกต้อง: ${problems.join('; ')}`);
  const at = rules.findIndex((r) => r.id === rule.id);
  const full = { defaultOn: true, title: rule.id, ...rule };
  if (at === -1) rules.push(full); else rules[at] = full; // re-registering an id replaces it (HMR safe)
  return full;
};

export const listRules = () => [...rules];
