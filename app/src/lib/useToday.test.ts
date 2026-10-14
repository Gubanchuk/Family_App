import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToday } from './useToday';

describe('useToday', () => {
  afterEach(() => vi.useRealTimers());
  it('moves to the new day after midnight while the app stays open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 30));
    const { result } = renderHook(() => useToday());
    expect(result.current.getDate()).toBe(18);
    act(() => { vi.setSystemTime(new Date(2026, 9, 19, 0, 0, 30)); vi.advanceTimersByTime(60_000); });
    expect(result.current.getDate()).toBe(19);
  });
  it('keeps a fixed date when one is given', () => {
    const fixed = new Date(2026, 9, 13, 11, 40);
    const { result } = renderHook(() => useToday(fixed));
    expect(result.current).toBe(fixed);
  });
});
