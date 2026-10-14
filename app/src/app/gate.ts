export type GateInput = { path: string; loadingSession: boolean; session: boolean; loadingFamily: boolean; hasMember: boolean; inviteCode: string | null; familyError: boolean };
export type GateResult = 'loading' | 'probe' | 'sign-in' | 'family-error' | 'accept-invite' | 'onboarding' | 'app';

export function gate(i: GateInput): GateResult {
  if (i.path === '/probe') return 'probe';
  if (i.loadingSession) return 'loading';
  if (!i.session) return 'sign-in';
  if (i.loadingFamily) return 'loading';
  if (!i.hasMember && i.familyError) return 'family-error';
  if (!i.hasMember) return i.inviteCode ? 'accept-invite' : 'onboarding';
  return 'app';
}
