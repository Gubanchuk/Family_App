import { describe, expect, it, vi } from 'vitest';
import { kindOf, videoDecision } from './prepare';

const conv = vi.hoisted(() => ({ valid: true, discarded: [] as Array<{ track: { type: string }; reason: string }>, duration: 42 }));
vi.mock('mediabunny', () => {
  class Input { computeDuration = async () => conv.duration; getPrimaryVideoTrack = async () => ({ getDisplayWidth: async () => 1080, getDisplayHeight: async () => 1920 }); }
  class Output { target = { buffer: new ArrayBuffer(8) }; }
  const Conversion = { init: vi.fn(async (o: unknown) => ({ o, isValid: conv.valid, discardedTracks: conv.discarded, onProgress: null as null | ((p: number) => void), execute: async function (this: { onProgress: null | ((p: number) => void) }) { this.onProgress?.(1); } })) };
  return { Input, Output, Conversion, ALL_FORMATS: [], BlobSource: class {}, Mp4OutputFormat: class {}, BufferTarget: class {}, QUALITY_LOW: 'low' };
});

describe('preparing a story file', () => {
  it('tells photos from videos and refuses anything else', () => {
    expect(kindOf(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe('photo');
    expect(kindOf(new File([''], 'a.mov', { type: 'video/quicktime' }))).toBe('video');
    expect(kindOf(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
  });
  it('shrinks a video when the phone can, sends a short light original when it cannot, refuses the rest', () => {
    expect(videoDecision({ canConvert: true, durationS: 95, size: 300e6 })).toBe('convert');
    expect(videoDecision({ canConvert: false, durationS: 28, size: 40e6 })).toBe('original');
    expect(videoDecision({ canConvert: false, durationS: 45, size: 20e6 })).toBe('refuse');
    expect(videoDecision({ canConvert: false, durationS: 20, size: 60e6 })).toBe('refuse');
  });
});

describe('prepareVideo', () => {
  it('cuts a long video to 30 seconds at 720p and says it was cut', async () => {
    const { prepareVideo } = await import('./prepare');
    const p = await prepareVideo(new File(['x'], 'v.mp4', { type: 'video/mp4' }), () => {});
    expect(p).toMatchObject({ kind: 'video', width: 720, height: 1280, durationMs: 30_000, trimmed: true });
    const { Conversion } = await import('mediabunny');
    expect(Conversion.init).toHaveBeenCalledWith(expect.objectContaining({ trim: { start: 0, end: 30 }, video: expect.objectContaining({ width: 720, height: 1280 }) }));
  });

  it('refuses a long video the phone cannot shrink', async () => {
    conv.valid = false;
    conv.duration = 50;
    const { prepareVideo } = await import('./prepare');
    await expect(prepareVideo(new File(['x'], 'v.mp4', { type: 'video/mp4' }), () => {})).rejects.toThrow('refuse');
    conv.valid = true;
  });

  it('sends a short original when the sound cannot be kept', async () => {
    conv.duration = 12;
    conv.discarded = [{ track: { type: 'audio' }, reason: 'no_encodable_target_codec' }];
    const { prepareVideo } = await import('./prepare');
    const file = new File(['x'], 'v.mov', { type: 'video/quicktime' });
    const p = await prepareVideo(file, () => {});
    expect(p).toMatchObject({ blob: file, width: 1080, height: 1920, durationMs: 12_000, trimmed: false });
    conv.discarded = [];
    conv.duration = 42;
  });
});
