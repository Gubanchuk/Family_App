// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addUser, asUser, createDb } from '../db/harness';
import { createLocalDb } from '../../src/data/db';
import { pushOutbox } from '../../src/data/sync';
import type { Member } from '../../src/features/family/useFamily';
import { addManualItem, endTrip, goShopping, setBought } from '../../src/features/shop/shopActions';
import { runOut, setAtHome, setStock } from '../../src/features/shop/stock';
import { pgClient } from './pgClient';

const MAMA = '00000000-0000-0000-0000-0000000000f8';

// The app's home stock and trip actions as PostgREST-like upserts on PGlite with the real migrations.
describe('home stock and trip carts reach the server', { timeout: 120_000 }, () => {
  it('stock, at-home marks, a line that ran out and a trip with a cart are all accepted', async () => {
    const pg = await createDb();
    await addUser(pg, MAMA);
    const one = async <T>(sql: string, p: unknown[] = []) => (await asUser(pg, MAMA, sql, p)).rows[0] as T;
    const hh = (await one<{ id: string }>("select public.create_household('Семья', 'Оля', '#E0457B', 'mother') as id")).id;
    const id = (await one<{ id: string }>('select id from public.members where user_id = $1', [MAMA])).id;
    const mama: Member = { id, household_id: hh, user_id: MAMA, name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
    const phone = createLocalDb(`c-${Math.random()}`);
    await phone.meta.put({ key: 'features', value: ['homeCart'] });
    const vocab = new Map([['молоко', { item: 'молоко', unit: 'мл', dept: 'Молочное и яйца', grp: 'dairy', piece_weight: null, piece_name: null, pantry: false }]]);
    const push = async () => {
      const r = await pushOutbox(phone, pgClient(pg, MAMA) as never);
      expect(r.rejected).toEqual([]);
      expect(r.stopped).toBeNull();
    };

    await addManualItem(phone, mama, { title: 'Хлеб', qtyText: '', urgent: false, vocab, id: 'u:bread' });
    const bread = (await phone.shopping_items.get('u:bread'))!;
    await setAtHome(phone, bread, mama, true);
    await setStock(phone, mama, { item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца' }, 'have');
    await push();
    expect(await one('select at_home, bought from public.shopping_marks')).toEqual({ at_home: true, bought: false });

    await runOut(phone, mama, (await phone.home_stock.get([hh, 'молоко']))!, { items: [], marks: new Map(), weekStart: '2026-10-12' });
    await goShopping(phone, mama, new Date(), { label: 'молоко', items: [{ id: 'h:2026-10-12:0:молоко', hint: null }] });
    await push();
    expect(await one("select source from public.shopping_items where id = 'h:2026-10-12:0:молоко'")).toEqual({ source: 'home' });
    expect(await one("select state from public.home_stock where key = 'молоко'")).toEqual({ state: 'out' });

    const line = (await phone.shopping_items.get('h:2026-10-12:0:молоко'))!;
    await setBought(phone, line, mama, true, undefined, { vocab });
    await endTrip(phone, (await phone.shop_trips.toArray())[0]);
    await push();
    expect(await one("select state from public.home_stock where key = 'молоко'")).toEqual({ state: 'have' });
    expect(await one('select label, ended_at is not null as ended, jsonb_array_length(items) as n from public.shop_trips')).toEqual({ label: 'молоко', ended: true, n: 1 });

    // Another phone never saw «есть дома» on the bread and buys it with a plain mark: the server takes the purchase.
    const other = createLocalDb(`c-${Math.random()}`);
    await setBought(other, bread, mama, true);
    const r = await pushOutbox(other, pgClient(pg, MAMA) as never);
    expect(r.rejected).toEqual([]);
    expect(await one("select bought, at_home from public.shopping_marks where item_id = 'u:bread'")).toEqual({ bought: true, at_home: false });
  });
});
