import { useRef, useState } from 'react';

/**
 * Click-or-drop file picker.
 *  - resets the <input> after every pick so the same file can be chosen twice
 *  - highlights while a file is dragged over it
 */
export default function FileDropZone({ accept, multiple = false, onFiles, disabled = false, className = '', activeClassName = '', children }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const emit = (list) => {
    const files = Array.from(list || []);
    if (files.length) onFiles?.(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    emit(e.dataTransfer?.files);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`${className} ${dragging ? activeClassName : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => { emit(e.target.files); e.target.value = ''; }}
      />
      {typeof children === 'function' ? children({ dragging }) : children}
    </div>
  );
}
