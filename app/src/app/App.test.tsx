import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../features/auth/useSession', () => ({ useSession: () => ({ session: null, loading: false }) }));
vi.mock('../features/family/useFamily', () => ({ useFamily: () => ({ me: null, members: [], loading: false, error: false, reload: vi.fn() }) }));

describe('App', () => {
  it('asks a signed-out person to sign in', async () => {
    const { default: App } = await import('./App');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Войти через Google' })).toBeInTheDocument();
  });
});
