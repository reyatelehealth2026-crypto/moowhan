// sha256 of a file's bytes (or a string). Pure: uses Web Crypto (browser and Node >= 19).
// Returns 'n/a' when Web Crypto is unavailable so callers can skip the comparison instead of failing.
const toBytes = (input) => {
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('sha256Hex: ต้องเป็น ArrayBuffer, typed array หรือ string');
};

export const sha256Hex = async (input) => {
  const bytes = toBytes(input);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return 'n/a';
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};
