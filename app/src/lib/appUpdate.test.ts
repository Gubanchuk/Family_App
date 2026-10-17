import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppUpdate } from './appUpdate';

function fakeContainer(controller: object | null) {
  const target = new EventTarget();
  const update = vi.fn(() => Promise.resolve());
  const sw = Object.assign(target, { controller, getRegistration: vi.fn(() => Promise.resolve({ update })) });
  return { sw: sw as unknown as ServiceWorkerContainer, update };
}
// A clock the test moves by hand.
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, pass: (ms: number) => { t += ms; } };
}

describe('useAppUpdate', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('takes a new version at once when it arrives right after start', () => {
    const { sw } = fakeContainer({});
    const reload = vi.fn();
    const { result } = renderHook(() => useAppUpdate(sw, reload, clock().now));
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('takes a new version at once right after the app comes back on screen', async () => {
    const { sw, update } = fakeContainer({});
    const reload = vi.fn();
    const c = clock();
    renderHook(() => useAppUpdate(sw, reload, c.now));
    c.pass(10 * 60_000);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(update).toHaveBeenCalled();
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).toHaveBeenCalled();
  });

  it('offers a reload instead when a form is open', () => {
    const { sw } = fakeContainer({});
    const reload = vi.fn();
    document.body.innerHTML = '<section role="dialog" aria-modal="true"><input value="Омлет"></section>';
    const { result } = renderHook(() => useAppUpdate(sw, reload, clock().now));
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBe(true);
  });

  it('offers a reload when a new version arrives in the middle of use', () => {
    const { sw } = fakeContainer({});
    const reload = vi.fn();
    const c = clock();
    const { result } = renderHook(() => useAppUpdate(sw, reload, c.now));
    c.pass(10 * 60_000);
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBe(true);
  });

  it('does not call the first install an update', () => {
    const { sw } = fakeContainer(null);
    const reload = vi.fn();
    const { result } = renderHook(() => useAppUpdate(sw, reload, clock().now));
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('looks for a new version at start', async () => {
    const { sw, update } = fakeContainer({});
    await act(async () => { renderHook(() => useAppUpdate(sw, vi.fn(), clock().now)); });
    expect(update).toHaveBeenCalled();
  });

  it('offers a reload instead while someone types, also outside a sheet', () => {
    const { sw } = fakeContainer({});
    const reload = vi.fn();
    document.body.innerHTML = '<input type="email" />';
    (document.querySelector('input') as HTMLInputElement).focus();
    const { result } = renderHook(() => useAppUpdate(sw, reload, clock().now));
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBe(true);
  });
});
