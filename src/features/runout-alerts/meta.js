export const ID = 'runout-alerts';

/** profile.features[id] is the persisted slot (settings-profile saves it); keep the other keys when patching. */
export const slotOf = (state) => state.profile?.features?.[ID] || {};

/** Note texts by row key from the shared notes store (manual-edit), plus the runout-owned note per key. */
export const notesByKey = (state) => {
  const out = {};
  (state.features?.['manual-edit']?.notes || []).forEach((n) => {
    if (typeof n?.key === 'string' && n.key.startsWith('row:')) (out[n.key.slice(4)] ||= []).push(n.text);
  });
  return out;
};
