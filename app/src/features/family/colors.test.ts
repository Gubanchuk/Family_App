import { describe, expect, it } from 'vitest';
import { memberColor } from './colors';

describe('memberColor', () => {
  it('takes a family colour from the theme, so night gets its lighter shade', () => {
    expect(memberColor('#2F6FDB')).toBe('var(--papa)');
    expect(memberColor('#e0457b')).toBe('var(--mama)');
    expect(memberColor('#1FA463')).toBe('var(--son)');
    expect(memberColor('#F2A900')).toBe('var(--dima)');
  });
  it('keeps any other colour as it is', () => {
    expect(memberColor('#123456')).toBe('#123456');
  });
});
