// axe-core wrapper for jsdom. Returns serious/critical violations only.
import axe from 'axe-core';

/** @param {Element} container */
export const seriousViolations = async (container, rules = {}) => {
  const res = await axe.run(container, {
    // jsdom has no layout/canvas: colour contrast and region landmarks cannot be judged here
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, ...rules },
    resultTypes: ['violations'],
  });
  return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
};

export const describeViolations = (list) => list.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join('\n');
