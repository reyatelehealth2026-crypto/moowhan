import { DEFAULT_SUPP_CODE } from '../../constants.js';

export const DEFAULT_SETTINGS = {
  rules: {},                       // { R01: false } switches a rule off; absent = the rule's defaultOn
  suppCode: DEFAULT_SUPP_CODE,     // R05
  partPattern: '',                 // R04: regular expression source; '' = built-in pattern
  allowedForecastTypes: ['F'],     // R07
  thresholds: { swingRatio: 3 },   // K05: N+k vs N+k-1 ratio that counts as a big swing
};

export const mergeSettings = (s = {}) => ({
  ...DEFAULT_SETTINGS,
  ...s,
  rules: { ...DEFAULT_SETTINGS.rules, ...(s?.rules || {}) },
  thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(s?.thresholds || {}) },
});

export const isRuleOn = (rule, settings) => {
  const v = settings?.rules?.[rule.id];
  return v === undefined ? rule.defaultOn !== false : !!v;
};
