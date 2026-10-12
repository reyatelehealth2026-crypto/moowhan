// sha256 prefix (8 hex chars) used to tell whether the remembered template is the file the user thinks it is.
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Prefix(buffer, len = 8) {
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return hex(new Uint8Array(digest)).slice(0, len);
  } catch {
    // no WebCrypto (insecure origin): FNV-1a so the field is still a stable fingerprint
    let h = 0x811c9dc5;
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0').slice(0, len);
  }
}
