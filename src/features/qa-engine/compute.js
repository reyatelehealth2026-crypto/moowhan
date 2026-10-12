// Memoised QA run for the UI hooks (badge, validate, tab). Pure: inputs are read from a feature ctx.
import { runRules } from './engine.js';
import { mergeSettings } from './settings.js';
import { getWaiverStore } from './waivers.js';

export const FEATURE_ID = 'qa-engine';

/** settings: profile.features[id].settings (settings-profile) over state.features[id].settings over defaults */
export const settingsOf = (state) =>
  mergeSettings({ ...(state?.profile?.features?.[FEATURE_ID]?.settings || {}), ...(state?.features?.[FEATURE_ID]?.settings || {}) });

export const waiversOf = (state) => state?.features?.[FEATURE_ID]?.waivers ?? getWaiverStore().all();

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
let last = { deps: null, issues: [] };
const same = (a, b) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * All QA issues for the current state. Cached on the identity of its inputs so that App-level hooks
 * (badge on every render, validate) and the tab share one run. `ctx.today` can be injected.
 */
export const computeIssues = (ctx, { force = false } = {}) => {
  const s = ctx?.state;
  if (!s?.processedData) return [];
  const settings = settingsOf(s);
  const waivers = waiversOf(s);
  const today = ctx.today ?? new Date();
  const deps = [s.processedData, s.sourceFiles, s.template, s.productionMonth, s.features?.[FEATURE_ID]?.settings, s.profile?.features?.[FEATURE_ID]?.settings, waivers, dayKey(today)];
  if (!force && same(last.deps, deps)) return last.issues;
  const issues = runRules({ processedData: s.processedData, sourceFiles: s.sourceFiles, productionMonth: s.productionMonth, template: s.template, settings, waivers, today });
  last = { deps, issues };
  return issues;
};
