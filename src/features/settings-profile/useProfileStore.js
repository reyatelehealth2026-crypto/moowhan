import { useEffect, useRef } from 'react';
import { PROFILE_STORAGE_KEY, mergeWithDefaults, validateProfile } from './profile.js';

const SAVE_DELAY_MS = 300;
const loadStorage = () => import('../../lib/storage/index.js');
let registered = false;
const ensureRegistered = (mod) => {
  if (registered) return;
  registered = true;
  mod.registerKey({ key: PROFILE_STORAGE_KEY, tier: 'prefs', purpose: 'โปรไฟล์ตั้งค่าของแอป (ชื่อไฟล์ส่งออก ปฏิทินวันทำงาน ตารางโรงงาน)', retention: null });
};

/**
 * Loads the saved profile once (invalid ones are ignored) and saves later changes, debounced.
 * Storage failures are swallowed by src/lib/storage (memory fallback), so the app keeps working.
 * `replace(profile)` swaps the whole profile; `profile` is the current one.
 */
export default function useProfileStore(profile, replace) {
  const ready = useRef(false);
  const initial = useRef(profile);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await loadStorage();
        ensureRegistered(mod);
        const saved = await mod.getStorage().get('prefs', PROFILE_STORAGE_KEY);
        if (alive && saved && validateProfile(saved).ok) replace(mergeWithDefaults(saved));
      } catch (err) {
        console.warn('settings-profile: อ่านโปรไฟล์ที่บันทึกไว้ไม่ได้', err);
      } finally {
        if (alive) { initial.current = null; ready.current = true; }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seen = useRef(profile);
  useEffect(() => {
    if (!ready.current || seen.current === profile) { seen.current = profile; return undefined; }
    seen.current = profile;
    const t = setTimeout(async () => {
      try {
        const mod = await loadStorage();
        ensureRegistered(mod);
        await mod.getStorage().put('prefs', PROFILE_STORAGE_KEY, profile);
      } catch (err) {
        console.warn('settings-profile: บันทึกโปรไฟล์ไม่สำเร็จ', err);
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [profile]);
}
