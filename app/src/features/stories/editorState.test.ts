import { describe, expect, it } from 'vitest';
import { editor, initialEditor } from './editorState';

describe('story editor', () => {
  it('adds a caption in the middle and opens it for typing', () => {
    const s = editor(initialEditor([]), { t: 'add-text' });
    expect(s.items).toEqual([expect.objectContaining({ type: 'text', text: '', x: 0.5, y: 0.5, color: '#FFFFFF', style: 'plain' })]);
    expect(s.editing).toBe(s.items[0].id);
  });
  it('drops a caption left empty when typing is done', () => {
    let s = editor(initialEditor([]), { t: 'add-text' });
    s = editor(s, { t: 'done' });
    expect(s.items).toEqual([]);
  });
  it('keeps a typed caption, changes it, and removes it', () => {
    let s = editor(initialEditor([]), { t: 'add-text' });
    const id = s.items[0].id;
    s = editor(s, { t: 'patch', id, patch: { text: 'Привет' } });
    s = editor(s, { t: 'done' });
    expect(s.items[0]).toMatchObject({ text: 'Привет' });
    s = editor(s, { t: 'patch', id, patch: { color: '#C92A62', style: 'box' } });
    expect(s.items[0]).toMatchObject({ color: '#C92A62', style: 'box' });
    s = editor(s, { t: 'remove', id });
    expect(s.items).toEqual([]);
  });
  it('places a sticker selected and above the rest', () => {
    const s = editor(editor(initialEditor([]), { t: 'add-emoji', char: '🎉' }), { t: 'add-emoji', char: '🔥' });
    expect(s.items.map((o) => (o.type === 'emoji' ? o.char : ''))).toEqual(['🎉', '🔥']);
    expect(s.selected).toBe(s.items[1].id);
  });
});
