import { describe, expect, it } from 'vitest';
import { gate } from './gate';

const base = { path: '/', loadingSession: false, session: true, loadingFamily: false, hasMember: true, inviteCode: null };

describe('gate', () => {
  it('lets the probe open without sign-in', () => expect(gate({ ...base, path: '/probe', session: false })).toBe('probe'));
  it('asks to sign in first', () => expect(gate({ ...base, session: false })).toBe('sign-in'));
  it('waits while the session loads', () => expect(gate({ ...base, loadingSession: true })).toBe('loading'));
  it('accepts an invite before creating a family', () => expect(gate({ ...base, hasMember: false, inviteCode: 'ABCD234XYZ' })).toBe('accept-invite'));
  it('offers to create a family to a new person', () => expect(gate({ ...base, hasMember: false })).toBe('onboarding'));
  it('opens the app for a member', () => expect(gate(base)).toBe('app'));
  it('keeps the invite for after sign-in', () => expect(gate({ ...base, session: false, inviteCode: 'ABCD234XYZ' })).toBe('sign-in'));
});
