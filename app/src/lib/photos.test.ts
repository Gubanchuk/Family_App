import { describe, expect, it, vi } from 'vitest';
import { photoPathFor } from './photos';

const deps = () => ({ upload: vi.fn(async () => {}), resize: vi.fn(async (f: Blob) => ({ blob: f })), now: () => 1700 });

describe('photoPathFor', () => {
  it('keeps, clears or uploads a squeezed photo into the family folder', async () => {
    const d = deps();
    expect(await photoPathFor('h1', 'recipes', 'own-1', { kind: 'keep' }, d)).toBeUndefined();
    expect(await photoPathFor('h1', 'recipes', 'own-1', { kind: 'remove' }, d)).toBeNull();
    const file = new Blob(['x'], { type: 'image/png' });
    expect(await photoPathFor('h1', 'wishes', 'w1', { kind: 'new', file }, d)).toBe('h1/photos/wishes/w1/1700.jpg');
    expect(d.resize).toHaveBeenCalledWith(file);
    expect(d.upload).toHaveBeenCalledWith('h1/photos/wishes/w1/1700.jpg', file, 'image/jpeg');
  });
});
