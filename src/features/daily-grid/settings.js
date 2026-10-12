import { loadSettings, saveSettings } from './views.js';

export const ID = 'daily-grid';
export const DAILY_TOTAL_SHEET = 'Daily Total';

/** Feature data in state.features, falling back to localStorage (try/catch inside loadSettings). */
export const settingsOf = (ctx) => ctx.state.features?.[ID]?.settings ?? loadSettings();
export const updateSettings = (ctx, patch) => {
  const next = { ...settingsOf(ctx), ...patch };
  saveSettings(next);
  ctx.actions.setFeatureData(ID, { settings: next });
};
export const setPrint = (ctx, open) => ctx.actions.setFeatureData(ID, { printOpen: open });
