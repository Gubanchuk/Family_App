import { describe, expect, it } from 'vitest';
import { syncLine } from './SyncStatus';

const NOW = new Date(2026, 9, 14, 11, 40);

describe('syncLine', () => {
  it('says everything is saved with the time', () => {
    expect(syncLine({ offline: false, pending: 0, syncedAt: new Date(2026, 9, 14, 11, 38).toISOString() }, NOW)).toBe('всё сохранено · 11:38');
  });
  it('counts changes waiting for the network', () => {
    expect(syncLine({ offline: true, pending: 3, syncedAt: null }, NOW)).toBe('нет сети · 3 изменения ждут отправки');
    expect(syncLine({ offline: true, pending: 1, syncedAt: null }, NOW)).toBe('нет сети · 1 изменение ждёт отправки');
    expect(syncLine({ offline: true, pending: 5, syncedAt: null }, NOW)).toBe('нет сети · 5 изменений ждут отправки');
  });
  it('shows a date for an old sync', () => {
    expect(syncLine({ offline: false, pending: 0, syncedAt: new Date(2026, 9, 12, 9, 5).toISOString() }, NOW)).toBe('всё сохранено · 12.10 в 09:05');
  });
});
