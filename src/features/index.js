// ==================== FEATURE REGISTRY ====================
// Every `src/features/<id>/index.jsx` that `export default`s a feature is picked up automatically
// (Vite import.meta.glob). Wrap the spec in defineFeature() (./defineFeature.js): it validates the
// contract at module-eval (DEV: throws a Thai error; production: warns and excludes the module).
// Plain objects still work and are validated the same way.
//
// Code splitting: this registry is eager, so index.jsx must only carry metadata (id, order, group, tab label/Icon/badge/
// enabled) and the hooks that run synchronously. Load tab Components, modals and heavy logic with lazyComponent()
// (./lazy.js) and `await import(...)` inside async hooks, otherwise `npm run check:bundle` fails the entry budget.
//
// @typedef {{ level: 'block'|'confirm'|'info', code: string, message: string, sheet?: string, rowId?: string, fix?: any }} Issue
// @typedef {{ name: string, aoa: any[][] }} Sheet
//
// export default defineFeature({
//   id: 'qa',                    // kebab-case, unique; also the tab id
//   order: 55,                   // must be inside the group band (below)
//   group: 'ตรวจสอบ',            // core 10-49 | ตรวจสอบ 50-69 | วิเคราะห์ 70-89 (default) | ประวัติ 90-94 | ตั้งค่า 95-99
//   description: 'ตรวจคุณภาพข้อมูล',
//   tab: {                       // optional
//     label, Icon /* from components/Icons.jsx */, Component /* { state, actions, monthLabels } */,
//     enabled: (ctx) => bool, tooltip, emptyState,
//     badge: (ctx) => number | { count, severity: 'error'|'warning'|'info' },
//   },
//   headerActions: (ctx) => [{ label, Icon, onClick, priority }],   // max 3 inline, rest in menu
//                                                                    // (a single legacy element is accepted)
//   exportSheets: (ctx) => Sheet[] | Promise<Sheet[]>,   // names: <= 31 chars, unique, not a template sheet
//   exportCellWrites: (ctx) => CellWrite[],              // applied by the patcher (never on formula cells)
//   validate: (ctx) => Issue[],                          // after processing: feeds badges / QA
//   beforeExport: (ctx) => Issue[],                      // at export time: gate-only items
//   onProcessed: (ctx, result) => void,                  // ctx is fresh; result = ProcessResult
//   onExported: (ctx, result) => void,
//   expandFiles: (file) => Promise<File[]|null>,
//   slots: { banner: (ctx) => node, uploadPanel: (ctx) => node },
//   settings: { defaults, Component, schema },
// })
//
// ctx = { state, actions, monthLabels }; state.features[id] holds feature data (actions.setFeatureData).
// Every hook runs through runtime.js runHook(): an exception is swallowed, reported in Thai and logged.
// Visibility (visibility.js): profile.features[id].enabled === false hides a feature; simple mode keeps
// only groups core + ตรวจสอบ. Hidden features lose UI/export/hooks only, not their pure logic modules.
import { defineFeature } from './defineFeature.js';

const modules = import.meta.glob('./*/index.jsx', { eager: true });

export const FEATURES = Object.entries(modules)
  .map(([file, mod]) => {
    const raw = mod?.default;
    if (!raw?.id) {
      console.warn(`features: ${file} has no default export with an id, skipped`);
      return null;
    }
    return defineFeature(raw); // re-validates (plain objects included) and fills the default group
  })
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

const seen = new Set();
for (let i = FEATURES.length - 1; i >= 0; i--) {
  const f = FEATURES[i];
  if (seen.has(f.id)) {
    const msg = `ฟีเจอร์ "${f.id}": id ซ้ำกับฟีเจอร์อื่น`;
    if (import.meta.env?.DEV) throw new Error(msg);
    console.warn(`features: ${msg}`);
    FEATURES.splice(i, 1);
  }
  seen.add(f.id);
}
