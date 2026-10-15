import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import { useBoardReady } from './useBoard';

describe('board tab', () => {
  it('waits for a full pull that confirms the board tables, not just any earlier sync', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.meta.put({ key: 'synced_at', value: '2026-10-14T10:00:00Z' });
    const { result } = renderHook(() => useBoardReady(db));
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
    await db.meta.put({ key: 'missing_tables', value: ['wishes'] });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
    await db.meta.put({ key: 'missing_tables', value: [] });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
