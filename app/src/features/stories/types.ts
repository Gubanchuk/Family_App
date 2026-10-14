export const REACTIONS = ['❤️', '😂', '😍', '😮', '😢', '🔥', '👍', '👏'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const TEXT_COLORS = ['#FFFFFF', '#111111', '#C92A62', '#F2A900', '#1FA463', '#2F6FDB', '#8E5CF7', '#FF7A45'];
export type TextStyle = 'plain' | 'box' | 'glass';

// x, y: centre in fractions of the 9:16 frame; scale: size in fractions of its width; rotation in degrees.
export type Overlay =
  | { id: string; type: 'text'; text: string; x: number; y: number; scale: number; rotation: number; color: string; style: TextStyle }
  | { id: string; type: 'emoji'; char: string; x: number; y: number; scale: number; rotation: number };

export type Story = {
  id: string; household_id: string; member_id: string; kind: 'photo' | 'video'; path: string;
  width: number; height: number; duration_ms: number | null; overlays: Overlay[]; created_at: string; expires_at: string;
};
export type StoryView = { story_id: string; member_id: string; viewed_at: string; reaction: Reaction | null };
export type Prepared = { blob: Blob; kind: 'photo' | 'video'; width: number; height: number; durationMs: number | null; trimmed: boolean };
