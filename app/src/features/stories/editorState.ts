import type { Overlay } from './types';

export type EditorState = { items: Overlay[]; selected: string | null; editing: string | null };
export type EditorAction =
  | { t: 'add-text' } | { t: 'add-emoji'; char: string } | { t: 'patch'; id: string; patch: Partial<Overlay> }
  | { t: 'remove'; id: string } | { t: 'select'; id: string | null } | { t: 'edit'; id: string } | { t: 'done' };

export const EMOJIS = [
  '😂', '😍', '🥰', '😎', '🤩', '😜', '🤔', '😴', '😋', '🥳', '😱', '🙈',
  '❤️', '🔥', '✨', '🎉', '👍', '👏', '💪', '🙏', '👀', '💯', '⭐', '🌈',
  '☀️', '🌧️', '❄️', '🍂', '🌸', '🎄', '🎂', '🍕', '🍔', '🍝', '🍰', '☕',
  '🏠', '🚗', '⚽', '🎮', '📚', '🎵', '🐶', '🐱', '👶', '👨‍👩‍👦', '🛒', '💤',
];

const newId = () => Math.random().toString(36).slice(2, 10);
export const initialEditor = (items: Overlay[]): EditorState => ({ items, selected: null, editing: null });

export function editor(s: EditorState, a: EditorAction): EditorState {
  switch (a.t) {
    case 'add-text': {
      const o: Overlay = { id: newId(), type: 'text', text: '', x: 0.5, y: 0.5, scale: 0.08, rotation: 0, color: '#FFFFFF', style: 'plain' };
      return { items: [...s.items, o], selected: o.id, editing: o.id };
    }
    case 'add-emoji': {
      const o: Overlay = { id: newId(), type: 'emoji', char: a.char, x: 0.5, y: 0.45, scale: 0.2, rotation: 0 };
      return { items: [...s.items, o], selected: o.id, editing: null };
    }
    case 'patch':
      return { ...s, items: s.items.map((o) => (o.id === a.id ? ({ ...o, ...a.patch } as Overlay) : o)) };
    case 'remove':
      return { items: s.items.filter((o) => o.id !== a.id), selected: null, editing: null };
    case 'select':
      return { ...s, selected: a.id };
    case 'edit':
      return { ...s, selected: a.id, editing: a.id };
    case 'done':
      return { items: s.items.filter((o) => o.type !== 'text' || o.text.trim()), selected: null, editing: null };
  }
}
