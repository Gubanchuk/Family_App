import { describe, expect, it } from 'vitest';
import { manifest } from '../pwa.config';

describe('pwa manifest', () => {
  it('names the app in Russian and uses the Berry colour', () => {
    expect(manifest.name).toBe('Семейный помощник');
    expect(manifest.short_name).toBe('Помощник');
    expect(manifest.lang).toBe('ru');
    expect(manifest.theme_color).toBe('#C92A62');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  });
});
