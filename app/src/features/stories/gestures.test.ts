import { describe, expect, it } from 'vitest';
import { moved, overTrash, pinched } from './gestures';
import type { Overlay } from './types';

const o: Overlay = { id: 'a', type: 'emoji', char: '🔥', x: 0.5, y: 0.5, scale: 0.2, rotation: 0 };
const frame = { w: 360, h: 640 };

describe('sticker gestures', () => {
  it('moves by the finger, in frame fractions, and stays inside the frame', () => {
    expect(moved(o, 36, -64, frame)).toMatchObject({ x: 0.6, y: 0.4 });
    expect(moved(o, 1000, 1000, frame)).toMatchObject({ x: 1, y: 1 });
  });
  it('scales by the change of distance and turns by the change of angle between two fingers', () => {
    const p = pinched(o, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 200 });
    expect(p.scale).toBeCloseTo(0.4);
    expect(p.rotation).toBeCloseTo(90);
  });
  it('keeps a sticker from growing past the frame or vanishing', () => {
    expect(pinched(o, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 }).scale).toBe(1.5);
    expect(pinched(o, { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }).scale).toBe(0.04);
  });
  it('knows when a dragged sticker is over the bin at the bottom centre', () => {
    expect(overTrash({ x: 180, y: 600 }, frame)).toBe(true);
    expect(overTrash({ x: 40, y: 600 }, frame)).toBe(false);
    expect(overTrash({ x: 180, y: 300 }, frame)).toBe(false);
  });
});
