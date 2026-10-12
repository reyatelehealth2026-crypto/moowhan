// Opens an .xlsx/.zip buffer. JSZip stays in this folder so features never import it themselves.
import JSZip from 'jszip';

/** @param {ArrayBuffer|Uint8Array} buffer */
export const loadZip = (buffer) => JSZip.loadAsync(buffer);
