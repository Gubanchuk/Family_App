import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAppUpdate } from './appUpdate';

function fakeContainer(controller: object | null) {
  const target = new EventTarget();
  const update = vi.fn(() => Promise.resolve());
  const sw = Object.assign(target, { controller, getRegistration: vi.fn(() => Promise.resolve({ update })) });
  return { sw: sw as unknown as ServiceWorkerContainer, update };
}

describe('useAppUpdate', () => {
  it('offers a reload once a new version has taken over the page', () => {
    const { sw } = fakeContainer({});
    const { result } = renderHook(() => useAppUpdate(sw));
    expect(result.current).toBe(false);
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(result.current).toBe(true);
  });

  it('does not call the first install an update', () => {
    const { sw } = fakeContainer(null);
    const { result } = renderHook(() => useAppUpdate(sw));
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(result.current).toBe(false);
  });

  it('looks for a new version when the app comes back on screen', async () => {
    const { sw, update } = fakeContainer({});
    renderHook(() => useAppUpdate(sw));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(update).toHaveBeenCalled();
  });
});
