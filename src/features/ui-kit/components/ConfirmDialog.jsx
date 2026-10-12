import Modal from '../../../components/Modal.jsx';
import Button from './Button.jsx';
import { STRINGS } from '../strings.js';

/** Two-action confirmation. Escape (or the backdrop) cancels. */
export default function ConfirmDialog({ title, message, confirmLabel = STRINGS.buttons.confirm, cancelLabel = STRINGS.buttons.cancel, danger = false, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} label={title} className="max-w-md">
      <div className="p-5 space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {message && <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
