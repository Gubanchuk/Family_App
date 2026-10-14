import { resizePhoto } from '../../lib/image';
import type { Prepared } from './types';

export const MAX_VIDEO_S = 30;
export const MAX_FILE = 52_428_800;

export function kindOf(file: File): 'photo' | 'video' | null {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

export function videoDecision(p: { canConvert: boolean; durationS: number; size: number }): 'convert' | 'original' | 'refuse' {
  if (p.canConvert) return 'convert';
  return p.durationS <= MAX_VIDEO_S + 0.5 && p.size <= MAX_FILE ? 'original' : 'refuse';
}

export async function preparePhoto(file: File): Promise<Prepared> {
  const r = await resizePhoto(file, 1080, 0.82);
  return { blob: r.blob, kind: 'photo', width: r.width, height: r.height, durationMs: null, trimmed: false };
}

// Filled in by the video step of the plan.
export async function prepareVideo(_file: File, _onProgress: (p: number) => void): Promise<Prepared> {
  throw new Error('video_later');
}
