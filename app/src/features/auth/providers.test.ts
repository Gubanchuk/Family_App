import { describe, expect, it } from 'vitest';
import { googleEnabled } from './providers';

const answer = (body: unknown, status = 200) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;

describe('googleEnabled', () => {
  it('reads the switch from the server settings', async () => {
    expect(await googleEnabled(answer({ external: { google: true, email: true } }))).toBe(true);
    expect(await googleEnabled(answer({ external: { google: false, email: true } }))).toBe(false);
  });
  it('does not know when the check itself fails', async () => {
    expect(await googleEnabled(answer({ message: 'Invalid API key' }, 401))).toBeNull();
    expect(await googleEnabled((() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch)).toBeNull();
  });
});
