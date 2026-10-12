import { useEffect, useId, useRef } from 'react';
import useEscapeKey from '../hooks/useEscapeKey.js';
import useFocusTrap from '../hooks/useFocusTrap.js';
import { acquireKeyboard } from '../features/ui-kit/hotkeys.js';

// Full-screen overlay. Closes on Escape and on backdrop click; traps focus and restores it on close.
// ownsKeyboard (default true) suspends the global shortcuts while the dialog is open.
export default function Modal({ onClose, className = '', children, label, ownsKeyboard = true }) {
  const id = useId();
  const dialog = useRef(null);
  useEscapeKey(onClose);
  useFocusTrap(dialog, true);
  useEffect(() => (ownsKeyboard ? acquireKeyboard() : undefined), [ownsKeyboard]);
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label ? id : undefined}
        tabIndex={-1}
        className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden outline-none ${className}`}
      >
        {label && <span id={id} className="sr-only">{label}</span>}
        {children}
      </div>
    </div>
  );
}
