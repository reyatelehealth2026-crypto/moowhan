import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { keyboardOwned } from '../ui-kit/hotkeys.js';
import { getSnapshot, openHelp, subscribe } from './helpStore.js';

// The modal (and with it the glossary text) is a separate chunk, fetched on first open.
const HelpModal = lazy(() => import('./HelpModal.jsx'));

const isEditable = (t) => {
  const tag = String(t?.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t?.isContentEditable;
};

// Rendered through the banner slot (present on every tab): hosts the modal and the '?' shortcut.
function HelpHost({ ctx }) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target) || keyboardOwned()) return;
      e.preventDefault();
      openHelp('shortcuts');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!snap.open && !snap.diagnostics) return null;
  return <Suspense fallback={null}><HelpModal ctx={ctx} /></Suspense>;
}

export default defineFeature({
  id: 'help-center',
  order: 99,
  group: 'ตั้งค่า',
  description: 'ศูนย์ช่วยเหลือ คำศัพท์ และรายงานปัญหา',
  headerActions: () => [{ label: 'วิธีใช้', Icon: Icons.Help, onClick: () => openHelp(), priority: 90 }],
  slots: { banner: (ctx) => <HelpHost ctx={ctx} /> },
});
