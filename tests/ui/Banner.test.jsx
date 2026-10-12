// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, userEvent } from './render.jsx';
import Banner from '../../src/components/Banner.jsx';
import { seriousViolations, describeViolations } from './axe.js';

describe('Banner', () => {
  it('renders nothing without a message', () => {
    const { container } = render(<Banner message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('error tone is an alert and can be dismissed', async () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(<Banner tone="error" message={'บรรทัด 1\nบรรทัด 2'} onDismiss={onDismiss} />);
    expect(getByRole('alert')).toHaveTextContent('บรรทัด 1');
    await userEvent.setup().click(getByRole('button', { name: 'ปิดข้อความ' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('warning and success tones are polite status messages', () => {
    for (const tone of ['warning', 'success']) {
      const { getByRole, unmount } = render(<Banner tone={tone} message="สำเร็จ" />);
      expect(getByRole('status')).toHaveTextContent('สำเร็จ');
      unmount();
    }
  });

  it('has no serious/critical a11y violations', async () => {
    const { container } = render(<Banner tone="error" message="ผิดพลาด" onDismiss={() => {}} />);
    const v = await seriousViolations(container);
    expect(v, describeViolations(v)).toEqual([]);
  });
});
