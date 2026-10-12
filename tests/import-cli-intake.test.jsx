// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import useConsolidator from '../src/state/useConsolidator.js';
import feature from '../src/features/import-cli/index.jsx';
import { expandFilesWith } from '../src/features/runtime.js';
import { SOURCE_FILES, fixture } from './helpers.js';

const base = (p) => p.split('/').pop();

async function zipFile(name = 'forecast.zip') {
  const z = new JSZip();
  SOURCE_FILES.forEach((p) => z.file(`forecast/${base(p)}`, fixture(p)));
  z.file('__MACOSX/forecast/._BP veh 481D.xls', 'x');
  z.file('sub/dir/download.xlsx', fixture('input/download.xlsx'));
  const inner = new JSZip(); inner.file('a.xls', 'x');
  z.file('inner.zip', await inner.generateAsync({ type: 'uint8array' }));
  return new File([await z.generateAsync({ type: 'uint8array' })], name);
}

const setup = () => renderHook(() => useConsolidator({ expandFiles: (f) => expandFilesWith([feature], f) }));

describe('addSourceFiles with archives', () => {
  it('a zip adds the 5 source files, validators run as for plain files, a second drop adds nothing', async () => {
    const { result } = setup();
    await act(async () => { await result.current.actions.addSourceFiles([await zipFile()]); });
    const s = result.current.state;
    expect(s.sourceFiles.map((f) => f.name).sort()).toEqual(SOURCE_FILES.map(base).sort());
    expect(s.fileCounts).toEqual({ BP: 1, BPK: 1, GW: 2, SR: 1 });
    expect(s.notice.message).toMatch(/^แตกไฟล์จาก forecast\.zip: เพิ่ม 5 ไฟล์ \(.*\) • ข้าม 2: .*inner\.zip.*download\.xlsx/s);
    const entry = s.changeLog.find((l) => /แตกไฟล์จาก forecast\.zip/.test(l.details));
    expect(entry.details).not.toMatch(/86790/); // counts and basenames only
    // extracted files are real Files that process like plain ones
    await act(async () => { await result.current.actions.processAll(); });
    await waitFor(() => expect(result.current.state.processedData).toBeTruthy());
    expect(result.current.state.processedData['BP Daily'][0].partNumber).toBe('86790-0K051-00');

    await act(async () => { await result.current.actions.addSourceFiles([await zipFile()]); });
    expect(result.current.state.sourceFiles).toHaveLength(5);
  });

  it('a .msg file gives the Thai error and adds nothing', async () => {
    const { result } = setup();
    await act(async () => { await result.current.actions.addSourceFiles([new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], 'mail.msg')]); });
    expect(result.current.state.sourceFiles).toHaveLength(0);
    expect(result.current.state.error).toMatch(/ยังไม่รองรับ/);
  });

  it('an oversize zip is refused with a Thai message', async () => {
    const z = new JSZip();
    for (let i = 0; i < 201; i++) z.file(`BP${i}.xls`, 'x');
    const { result } = setup();
    await act(async () => { await result.current.actions.addSourceFiles([new File([await z.generateAsync({ type: 'uint8array' })], 'big.zip')]); });
    expect(result.current.state.sourceFiles).toHaveLength(0);
    expect(result.current.state.error).toMatch(/เกินกำหนด/);
  });

  it('plain files still work without a hook', async () => {
    const { result } = renderHook(() => useConsolidator());
    await act(async () => { await result.current.actions.addSourceFiles([new File([fixture(SOURCE_FILES[0])], 'BP veh 481D.xls')]); });
    expect(result.current.state.sourceFiles).toHaveLength(1);
  });
});
