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

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

// Mediabunny (WebCodecs) re-encodes on the phone: 720p on the short side, low bitrate, first 30 s.
// Loaded only when a video is picked, so the app itself stays light.
export async function prepareVideo(file: File, onProgress: (p: number) => void): Promise<Prepared> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  const durationS = await input.computeDuration();
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('no_video');
  const w0 = await track.getDisplayWidth();
  const h0 = await track.getDisplayHeight();
  const k = Math.min(1, 720 / Math.min(w0, h0));
  const width = even(w0 * k);
  const height = even(h0 * k);
  const end = Math.min(durationS, MAX_VIDEO_S);
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const conversion = await mb.Conversion.init({
    input, output,
    video: { width, height, fit: 'fill', codec: 'avc', quality: mb.QUALITY_LOW },
    audio: { codec: 'aac' },
    trim: { start: 0, end },
    showWarnings: false,
  });
  // A dropped sound track counts as «cannot convert»: a silent copy of a family video is worse than the original.
  const lost = conversion.discardedTracks.some((d) => d.reason !== 'discarded_by_user');
  const decision = videoDecision({ canConvert: conversion.isValid && !lost, durationS, size: file.size });
  if (decision === 'refuse') throw new Error('refuse');
  if (decision === 'original') {
    onProgress(1);
    return { blob: file, kind: 'video', width: w0, height: h0, durationMs: Math.round(durationS * 1000), trimmed: false };
  }
  conversion.onProgress = (p: number) => onProgress(Math.min(0.99, p));
  await conversion.execute();
  onProgress(1);
  const buffer = (output.target as { buffer: ArrayBuffer | null }).buffer;
  if (!buffer) throw new Error('no_output');
  return { blob: new Blob([buffer], { type: 'video/mp4' }), kind: 'video', width, height, durationMs: Math.round(end * 1000), trimmed: durationS > MAX_VIDEO_S + 0.5 };
}
