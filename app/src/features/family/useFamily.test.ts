import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const result = { data: null as unknown, error: null as unknown };
const select = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: (...a: unknown[]) => { select(...a); return { is: () => ({ order: () => Promise.resolve(result) }) }; } }) },
}));

const session = (id: string) => ({ user: { id } }) as unknown as Session;
const papa = { id: 'm1', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: '1.00' };

describe('useFamily', () => {
  it('waits for the new person after switching accounts instead of showing an empty family', async () => {
    const { useFamily } = await import('./useFamily');
    const { result: r, rerender } = renderHook(({ s }) => useFamily(s), { initialProps: { s: session('u1') } });
    await waitFor(() => expect(r.current.me?.name).toBe('Папа'));
    result.data = [{ ...papa, id: 'm2', user_id: 'u2', name: 'Мама' }];
    rerender({ s: session('u2') });
    expect(r.current.loading).toBe(true);
    await waitFor(() => expect(r.current.me?.name).toBe('Мама'));
  });

  beforeEach(() => { localStorage.clear(); select.mockClear(); result.data = [papa]; result.error = null; });
  afterEach(() => localStorage.clear());

  it('loads the family and remembers it on the phone', async () => {
    const { useFamily } = await import('./useFamily');
    const { result: r } = renderHook(() => useFamily(session('u1')));
    await waitFor(() => expect(r.current.me?.name).toBe('Папа'));
    expect(r.current.error).toBe(false);
    expect(localStorage.getItem('fa.members.u1')).toContain('Папа');
  });

  it('shows the remembered family when the server is out of reach', async () => {
    localStorage.setItem('fa.members.u1', JSON.stringify([{ ...papa, portion: 1 }]));
    result.data = null;
    result.error = { message: 'TypeError: Failed to fetch' };
    const { useFamily } = await import('./useFamily');
    const { result: r } = renderHook(() => useFamily(session('u1')));
    await waitFor(() => expect(r.current.loading).toBe(false));
    expect(r.current.me?.name).toBe('Папа');
  });

  it('reports an error instead of an empty family when nothing is remembered', async () => {
    result.data = null;
    result.error = { message: 'TypeError: Failed to fetch' };
    const { useFamily } = await import('./useFamily');
    const { result: r } = renderHook(() => useFamily(session('u1')));
    await waitFor(() => expect(r.current.loading).toBe(false));
    expect(r.current.me).toBeNull();
    expect(r.current.error).toBe(true);
  });

  it('does not reload or blank the screen when the same person gets a fresh session object', async () => {
    const { useFamily } = await import('./useFamily');
    const { result: r, rerender } = renderHook(({ s }) => useFamily(s), { initialProps: { s: session('u1') } });
    await waitFor(() => expect(r.current.me?.name).toBe('Папа'));
    rerender({ s: session('u1') });
    expect(select).toHaveBeenCalledTimes(1);
    await act(async () => { await r.current.reload(); });
    expect(r.current.loading).toBe(false);
    expect(r.current.me?.name).toBe('Папа');
  });

  it('keeps the same family object when a reload brings nothing new, and picks up someone who joined', async () => {
    const { useFamily } = await import('./useFamily');
    const { result: r } = renderHook(() => useFamily(session('u1')));
    await waitFor(() => expect(r.current.me?.name).toBe('Папа'));
    const before = r.current.members;
    await act(async () => { await r.current.reload(); });
    expect(r.current.members).toBe(before);
    result.data = [papa, { ...papa, id: 'm2', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false }];
    await act(async () => { await r.current.reload(); });
    expect(r.current.members.map((m) => m.name)).toEqual(['Папа', 'Сын']);
  });
});
