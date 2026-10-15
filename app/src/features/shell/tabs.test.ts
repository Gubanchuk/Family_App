import { describe, expect, it } from 'vitest';
import { tabsFor } from './tabs';

describe('bottom tabs', () => {
  it('adds the board once its tables exist and money only for parents', () => {
    expect(tabsFor('parent', false, false)).toEqual(['home', 'menu', 'shop']);
    expect(tabsFor('parent', true, true)).toEqual(['home', 'menu', 'shop', 'board', 'money']);
    expect(tabsFor('child', true, true)).toEqual(['home', 'menu', 'shop', 'board']);
  });
});
