// UI kit barrel. (index.js, not index.jsx, on purpose: src/features/index.js auto-discovers
// `*/index.jsx` as feature modules and ui-kit is a library, not a feature.)
export { default as Button, buttonClass } from './components/Button.jsx';
export { default as Chip } from './components/Chip.jsx';
export { default as KpiCard } from './components/KpiCard.jsx';
export { default as ToastRegion } from './components/Toast.jsx';
export { default as ConfirmDialog } from './components/ConfirmDialog.jsx';
export { default as EmptyState } from './components/EmptyState.jsx';
export { default as InfoTip } from './components/InfoTip.jsx';
export { default as LiveRegion } from './components/LiveRegion.jsx';
export { default as DataGrid } from './DataGrid.jsx';
export { pushToast, announce } from './toastStore.js';
export { STRINGS, GLOSSARY, foundOf } from './strings.js';
export { searchRows, sortRows } from './gridUtils.js';
export { registerHotkey, listHotkeys } from './hotkeys.js';
