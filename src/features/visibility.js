// Pure filter deciding which features are shown. Called once from App.jsx.
// Hidden features lose their tabs, header actions, exportSheets, slots and onProcessed only.
const SIMPLE_GROUPS = new Set(['core', 'ตรวจสอบ']);

export const DEFAULT_PROFILE = { ui: { mode: 'advanced' }, features: {} };

/** @param opts.keepIds ids that must stay visible (e.g. tabs with block-level issues) */
export const visibleFeatures = (features, profile = DEFAULT_PROFILE, { keepIds } = {}) => {
  const simple = profile?.ui?.mode === 'simple';
  return features.filter((f) => {
    if (keepIds?.has(f.id)) return true;
    if (profile?.features?.[f.id]?.enabled === false) return false;
    if (simple && !SIMPLE_GROUPS.has(f.group ?? 'วิเคราะห์')) return false;
    return true;
  });
};
