import { describe, expect, it } from 'vitest';
import { kindOf, videoDecision } from './prepare';

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
