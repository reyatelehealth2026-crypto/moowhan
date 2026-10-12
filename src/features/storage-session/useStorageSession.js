import { useSyncExternalStore } from 'react';
import { getStorageSession } from './controller.js';

/** [snapshot, controller] for the shared storage-session controller. */
export default function useStorageSession() {
  const ctrl = getStorageSession();
  const snap = useSyncExternalStore(ctrl.subscribe, ctrl.snapshot);
  return [snap, ctrl];
}
