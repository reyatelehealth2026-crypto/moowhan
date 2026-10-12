// @ts-check
// Type-level canary for `npm run typecheck`: reading a state key that does not exist (e.g. a typo such as
// `ctx.state.processedDat`) must fail the check. Features may copy this annotation:
//   /** @param {import('../test-infra/types.js').FeatureCtx} ctx */
/** @param {import('./types.js').FeatureCtx} ctx */
export const hasProcessed = (ctx) => !!ctx.state.processedData && Object.keys(ctx.state.processedData).length > 0;
