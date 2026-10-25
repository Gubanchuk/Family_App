import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PushPrompt from './PushPrompt';
import type { Member } from '../family/useFamily';

const me: Member = { id: 'm-mama', household_id: 'h1', user_id: 'u2', name: 'Мама', color: '#E0457B', role: 'parent', is_owner: false, portion: 1 };
const support = (permission: string) => {
  vi.stubGlobal('Notification', { permission });
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
};

describe('PushPrompt', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
  it('promises payments to a parent only: a child sees none', () => {
    support('default');
    const { unmount } = render(<PushPrompt me={me} />);
    expect(screen.getByText('Просьбы, предложения блюд и платежи придут сразу.')).toBeInTheDocument();
    unmount();
    render(<PushPrompt me={{ ...me, id: 'm-son', name: 'Сын', role: 'child' }} />);
    expect(screen.getByText('Просьбы и предложения блюд придут сразу.')).toBeInTheDocument();
    expect(screen.queryByText(/платеж/)).toBeNull();
  });
  it('asks a phone that never chose and subscribes it in one tap', async () => {
    support('default');
    const subscribe = vi.fn(async () => 'on' as const);
    render(<PushPrompt me={me} subscribe={subscribe} />);
    await userEvent.click(screen.getByRole('button', { name: 'Включить' }));
    expect(subscribe).toHaveBeenCalledWith(me);
    expect(screen.queryByText('Включите уведомления')).toBeNull();
  });
  it('stays quiet once notifications are allowed or put off', async () => {
    support('granted');
    const { unmount } = render(<PushPrompt me={me} />);
    expect(screen.queryByText('Включите уведомления')).toBeNull();
    unmount();
    support('default');
    const again = render(<PushPrompt me={me} />);
    await userEvent.click(screen.getByRole('button', { name: 'Не сейчас' }));
    again.unmount();
    render(<PushPrompt me={me} />);
    expect(screen.queryByText('Включите уведомления')).toBeNull();
  });
});
