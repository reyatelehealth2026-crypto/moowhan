import { lazy } from 'react';

// Feature UI is code-split: index.jsx keeps only the eager metadata (id, order, group, tab label/Icon/badge/enabled)
// and loads Components, modals and heavy logic on demand. App.jsx renders lazy elements inside
// <Suspense fallback={<LoadingFallback />}> within FeatureErrorBoundary.
export const lazyComponent = (loader) => lazy(loader);

/** Dynamic import helper for async hooks: `const { x } = await load(() => import('./logic.js'))`. */
export const load = (loader) => loader();
