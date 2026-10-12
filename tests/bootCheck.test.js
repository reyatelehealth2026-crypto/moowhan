import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// package.json is type:module, so evaluate the classic script with a CommonJS-style `module`
const load = () => {
  const module = { exports: {} };
  new Function('module', fs.readFileSync('public/boot-check.js', 'utf8'))(module);
  return module.exports;
};
const boot = load();

const fakeWindow = (omit) => {
  const w = {
    structuredClone: () => {}, Array: { prototype: { at() {} } }, Object: { hasOwn() {} },
    Blob: { prototype: { arrayBuffer() {} } }, Promise: { allSettled() {} },
  };
  if (omit === 'structuredClone') delete w.structuredClone;
  return w;
};

describe('boot-check', () => {
  it('isSupported: true when complete, false when structuredClone is missing', () => {
    expect(boot.isSupported(fakeWindow())).toBe(true);
    expect(boot.isSupported(fakeWindow('structuredClone'))).toBe(false);
    expect(boot.isSupported(null)).toBe(false);
  });
  it('the real Node globals pass', () => {
    expect(boot.isSupported(globalThis)).toBe(true);
  });
  it('start(): timer is a no-op once booted, shows message otherwise', () => {
    const mount = { children: [], firstChild: null, appendChild(c) { this.children.push(c); } };
    const el = () => ({ style: {}, setAttribute() {}, appendChild() {} });
    const make = (booted) => {
      let cb;
      const w = { ...fakeWindow(), __moowhanBooted: booted, navigator: { userAgent: 'UA' }, setTimeout: (f) => { cb = f; return 1; }, document: { getElementById: () => mount, createElement: el } };
      return { w, fire: () => cb() };
    };
    const ok = make(true); boot.start(ok.w, 8000); ok.fire();
    expect(mount.children).toHaveLength(0);
    const bad = make(false); boot.start(bad.w, 8000); bad.fire();
    expect(mount.children).toHaveLength(1);
  });
  it('index.html loads boot-check.js as a classic script before the module entry, no inline script', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.every((m) => /\bsrc=/.test(m[1]) && m[2].trim() === '')).toBe(true);
    const iBoot = scripts.findIndex((m) => /boot-check\.js/.test(m[1]));
    const iMod = scripts.findIndex((m) => /type="module"/.test(m[1]));
    expect(iBoot).toBeGreaterThanOrEqual(0);
    expect(scripts[iBoot][1]).not.toMatch(/type=/);
    expect(iBoot).toBeLessThan(iMod);
    expect(html).toContain('กำลังโหลด...');
  });
});
