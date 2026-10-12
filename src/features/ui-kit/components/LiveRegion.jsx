import { useEffect, useState } from 'react';
import { live as defaultStore } from '../toastStore.js';

/** Visually hidden polite announcer. Use announce(text) from toastStore.js. */
export default function LiveRegion({ store = defaultStore }) {
  const [state, setState] = useState(store.get());
  useEffect(() => store.subscribe(setState), [store]);
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live-region" key={state.n}>{state.msg}</div>;
}
