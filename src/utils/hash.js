// SHA-256 helper (pure, no DOM). Returns lowercase hex, or 'n/a' where Web Crypto is unavailable.
const toBytes = async (input) => {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (input && typeof input.arrayBuffer === 'function') return new Uint8Array(await input.arrayBuffer()); // Blob / File
  throw new TypeError('sha256: ต้องเป็น ArrayBuffer, typed array, string หรือ Blob');
};

export const sha256 = async (input) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return 'n/a';
  try {
    const digest = await subtle.digest('SHA-256', await toBytes(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    if (err instanceof TypeError) throw err;
    return 'n/a';
  }
};

/** first 8 hex chars for display ('n/a' stays) */
export const shortHash = (hex) => (hex && hex !== 'n/a' ? String(hex).slice(0, 8) : 'n/a');
