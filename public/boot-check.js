/* Classic script (no inline JS): checks the browser can run the app, and shows a Thai message if it never boots. */
(function (root) {
  'use strict';

  var MESSAGE = 'เบราว์เซอร์นี้เก่าเกินไป กรุณาใช้ Chrome หรือ Edge เวอร์ชันล่าสุด หรือติดต่อ IT';

  function isSupported(win) {
    try {
      return !!(
        win &&
        typeof win.structuredClone === 'function' &&
        win.Array && typeof win.Array.prototype.at === 'function' &&
        win.Object && typeof win.Object.hasOwn === 'function' &&
        win.Blob && typeof win.Blob.prototype.arrayBuffer === 'function' &&
        win.Promise && typeof win.Promise.allSettled === 'function'
      );
    } catch (e) {
      return false;
    }
  }

  function showUnsupported(win) {
    var doc = win.document;
    var mount = doc.getElementById('root');
    if (!mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    var box = doc.createElement('div');
    box.setAttribute('data-testid', 'unsupported-browser');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'max-width:32rem;margin:3rem auto;padding:1.5rem;font-family:sans-serif;line-height:1.6;border:1px solid #fca5a5;background:#fef2f2;color:#7f1d1d;border-radius:12px';
    var p = doc.createElement('p');
    p.style.cssText = 'margin:0 0 .75rem;font-weight:600';
    p.textContent = MESSAGE;
    var ua = doc.createElement('p');
    ua.style.cssText = 'margin:0;font-size:12px;word-break:break-all;opacity:.8';
    ua.textContent = (win.navigator && win.navigator.userAgent) || '';
    box.appendChild(p);
    box.appendChild(ua);
    mount.appendChild(box);
  }

  function start(win, delayMs) {
    if (!isSupported(win)) {
      win.addEventListener('DOMContentLoaded', function () { showUnsupported(win); });
      if (win.document.readyState !== 'loading') showUnsupported(win);
      return null;
    }
    // the timer is a no-op once the app has set __moowhanBooted
    return win.setTimeout(function () {
      if (!win.__moowhanBooted) showUnsupported(win);
    }, delayMs);
  }

  var api = { isSupported: isSupported, showUnsupported: showUnsupported, start: start, MESSAGE: MESSAGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) start(root, 8000);
})(typeof window !== 'undefined' ? window : undefined);
