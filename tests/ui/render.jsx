// jsdom helpers. Opt a test file in with `// @vitest-environment jsdom` on its first line.
import { cleanup, render, renderHook, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { fixture, SOURCE_FILES } from '../helpers.js';
import useConsolidator from '../../src/state/useConsolidator.js';

afterEach(() => cleanup());

const toFile = (rel) => new File([fixture(rel)], rel.split('/').pop());

/**
 * Headless run of the real hook: add the real source files (+ template), processAll, and hand back
 * `{ ctx, result }` where ctx = { state, actions, monthLabels } is what features receive.
 * @param {{ template?: boolean, files?: string[] }} [opts]
 */
export const makeCtx = async ({ template = false, files = SOURCE_FILES } = {}) => {
  const hook = renderHook(() => useConsolidator());
  if (template) await act(async () => { await hook.result.current.actions.setTemplateFile(toFile('template.xlsx')); });
  act(() => hook.result.current.actions.addSourceFiles(files.map(toFile)));
  let result;
  await act(async () => { result = await hook.result.current.actions.processAll(); });
  await waitFor(() => { if (!hook.result.current.state.processedData) throw new Error('ยังประมวลผลไม่เสร็จ'); });
  const get = () => ({ state: hook.result.current.state, actions: hook.result.current.actions, monthLabels: hook.result.current.state.monthLabels });
  return { ctx: get(), get, result, hook };
};

/** Render a feature's tab Component (or any element) with a ctx. Returns Testing Library utils + user. */
export const renderFeature = (feature, ctx) => {
  const Tab = feature.tab.Component;
  return { user: userEvent.setup(), ...render(<Tab {...ctx} ctx={ctx} />) };
};

export { render, userEvent, act, waitFor };
