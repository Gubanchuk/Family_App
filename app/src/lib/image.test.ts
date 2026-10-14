import { describe, expect, it } from 'vitest';
import { clampCrop, cropRect } from './image';

describe('avatar crop', () => {
  it('cuts the largest centred square at zoom 1', () => {
    expect(cropRect(4000, 3000, { x: 0.5, y: 0.5, zoom: 1 })).toEqual({ sx: 500, sy: 0, side: 3000 });
  });
  it('shrinks the square with zoom and follows the chosen centre', () => {
    expect(cropRect(4000, 3000, { x: 0.25, y: 0.5, zoom: 2 })).toEqual({ sx: 250, sy: 750, side: 1500 });
  });
  it('keeps the square inside the picture', () => {
    expect(cropRect(4000, 3000, { x: 0, y: 1, zoom: 2 })).toEqual({ sx: 0, sy: 1500, side: 1500 });
    expect(clampCrop(4000, 3000, { x: 0, y: 1, zoom: 2 })).toEqual({ x: 0.1875, y: 0.75, zoom: 2 });
  });
});
