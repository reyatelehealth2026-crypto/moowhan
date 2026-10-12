// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, makeCtx } from './render.jsx';
import UploadTab from '../../src/components/UploadTab.jsx';
import TabBar from '../../src/components/TabBar.jsx';
import { seriousViolations, describeViolations } from './axe.js';

describe('rendered tabs (real fixtures through the real hook)', () => {
  it('makeCtx processes the five source files', async () => {
    const { ctx } = await makeCtx();
    expect(ctx.state.processedData['BP Daily']).toHaveLength(8);
    expect(ctx.state.summaryData.length).toBeGreaterThan(0);
    expect(ctx.state.productionMonth).toEqual({ year: 2026, month: 2 });
  });

  it('UploadTab has no serious/critical a11y violations', async () => {
    const { ctx } = await makeCtx();
    const { container, getByTestId } = render(<UploadTab state={ctx.state} actions={ctx.actions} />);
    expect(getByTestId('process')).toBeInTheDocument();
    const v = await seriousViolations(container);
    expect(v, describeViolations(v)).toEqual([]);
  });
});

describe('TabBar', () => {
  it('exposes tab roles and a selected tab', async () => {
    const tabs = [{ id: 'a', label: 'อัปโหลดไฟล์' }, { id: 'b', label: 'ตรวจสอบข้อมูล' }];
    const { container, getAllByRole } = render(<TabBar tabs={tabs} active="a" onChange={() => {}} />);
    expect(getAllByRole('tab').length).toBeGreaterThanOrEqual(2);
    const v = await seriousViolations(container);
    expect(v, describeViolations(v)).toEqual([]);
  });
});
