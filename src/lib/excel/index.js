// Barrel for the heavy Excel modules (xlsx + jszip). Imported lazily from the
// UI with `import('./lib/excel/index.js')` so the first paint stays light.
export * from './readSource.js';
export * from './exportWorkbook.js';
export * from './templateInfo.js';
export { patchTemplate, listSheetNames, forceRecalcOnOpen } from './templatePatcher.js';
// import-cli: lazy JSZip handle for archive intake (src/features/import-cli/zip.js)
export const loadJSZip = async () => (await import('jszip')).default;
export { inspectTemplate } from '../../features/template-inspector/templateInspect.js';
export { zipFiles } from './zipFiles.js';
export { verifyExport } from './verifyExport.js';
export { expectedTotals } from './expectedTotals.js';
