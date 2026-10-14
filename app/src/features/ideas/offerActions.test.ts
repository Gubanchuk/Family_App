import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { createOffer, declineOffer, offerDate, takeOffer } from './offerActions';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 0);

describe('offers', () => {
  it('turns today, tomorrow and the weekend into dates', () => {
    expect(offerDate('today', TUESDAY)).toBe('2026-10-13');
    expect(offerDate('tomorrow', TUESDAY)).toBe('2026-10-14');
    expect(offerDate('weekend', TUESDAY)).toBe('2026-10-17');
    expect(offerDate('weekend', new Date(2026, 9, 18, 10))).toBe('2026-10-18');
  });

  it('offers a dish, and taking it adds its products to the list', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    await db.meta.put({ key: 'family_portions', value: 3.5 });
    const offer = await createOffer(db, { me: son, to: papa.id, dish: 'mn-plov', date: '2026-10-13', meal: 'dinner', how: 'over' });
    expect(offer.status).toBe('open');
    await takeOffer(db, offer, papa);
    expect((await db.dish_offers.get(offer.id))?.taken_by).toBe('m-papa');
    const items = await db.shopping_items.where('household_id').equals('h1').toArray();
    expect(items.map((i) => [i.title, i.qty_text, i.source])).toEqual(expect.arrayContaining([['Рис', '300 г', 'offer'], ['Фарш', '350 г', 'offer']]));
  });

  it('cooks it myself in one step and can decline an offer', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const mine = await createOffer(db, { me: papa, to: null, dish: 'mn-plov', date: '2026-10-13', meal: 'dinner', how: 'instead', cookMyself: true });
    expect([mine.status, mine.taken_by, mine.to_member]).toEqual(['taken', 'm-papa', 'm-papa']);
    const other = await createOffer(db, { me: son, to: null, dish: 'br-syrniki', date: '2026-10-14', meal: 'breakfast', how: 'over' });
    await declineOffer(db, other);
    expect((await db.dish_offers.get(other.id))?.status).toBe('declined');
  });
});
