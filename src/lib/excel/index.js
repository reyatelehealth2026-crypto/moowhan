// Barrel for the heavy Excel modules (xlsx + jszip). Imported lazily from the
// UI with `import('./lib/excel/index.js')` so the first paint stays light.
export * from './readSource.js';
export * from './exportWorkbook.js';
export * from './templateInfo.js';
export { patchTemplate, listSheetNames, forceRecalcOnOpen } from './templatePatcher.js';
