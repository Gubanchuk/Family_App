// @vitest-environment node
import { describe, it } from 'vitest';

// The app's home stock and trip actions as PostgREST-like upserts on PGlite with the real migrations.
describe('home stock and trip carts reach the server', () => {
  it.todo('setStock and runOut are accepted');
  it.todo('setAtHome writes a mark the server keeps');
  it.todo('goShopping with a cart and endTrip are accepted');
});
