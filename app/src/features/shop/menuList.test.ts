import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import { seedMenu, RECIPES } from '../menu/testData';
import { replaceMeal } from '../menu/actions';
import { menuItemId, regenerateWeekList } from './menuList';

const items = async (db: ReturnType<typeof createLocalDb>) => new Map((await db.shopping_items.where('week_id').equals('w-cur').toArray()).filter((i) => !i.deleted_at).map((i) => [i.item, i]));

async function ready() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  return db;
}

describe('regenerateWeekList', () => {
  it('builds the list of an approved week', async () => {
    const db = await ready();
    expect(await regenerateWeekList(db, 'w-cur')).toBe('done');
    const list = await items(db);
    expect(list.get('творог')?.qty_text).toBe('1,8 кг');
    expect(list.get('яйца')?.qty_text).toBe('10 шт');
    expect(list.get('свёкла')?.qty_text).toBe('400 г');
    expect(list.get('фарш')?.est_price).toBe(1838);
    expect(list.get('яблоки')?.est_price).toBeNull();
    expect(list.has('мука')).toBe(false);
    expect(list.get('творог')?.id).toBe(menuItemId('w-cur', 'творог'));
  });

  it('recounts what is not bought yet and leaves bought lines alone', async () => {
    const db = await ready();
    await regenerateWeekList(db, 'w-cur');
    await db.shopping_marks.put({ item_id: menuItemId('w-cur', 'фарш'), household_id: 'h1', bought: true, by_member: 'm-papa', price_real: null, updated_at: 'x' });
    const week = (await db.weeks.get('w-cur'))!;
    await replaceMeal(db, week, 1, 'dinner', { recipe: RECIPES.find((r) => r.id === 'mn-plov')!, sides: [] });
    const list = await items(db);
    expect(list.get('фарш')?.qty_text).toBe('3,7 кг');
    expect(list.get('рис')?.qty_text).toBe('300 г');
    expect(list.get('яйца')?.qty_text).toBe('9 шт');
  });

  it('removes lines the menu no longer needs unless they were bought', async () => {
    const db = await ready();
    await regenerateWeekList(db, 'w-cur');
    await db.week_slots.where('week_id').equals('w-cur').modify((s) => { if (s.meal === 'snack') s.dish_id = null; });
    await regenerateWeekList(db, 'w-cur');
    expect((await db.shopping_items.get(menuItemId('w-cur', 'яблоки')))?.deleted_at).toBeTruthy();
  });

  it('does nothing for a proposed week', async () => {
    const db = await ready();
    await db.weeks.update('w-cur', { status: 'proposed' });
    expect(await regenerateWeekList(db, 'w-cur')).toBe('skipped');
    expect(await db.shopping_items.count()).toBe(0);
  });

  it('does not touch the list while the recipe base is missing on the phone', async () => {
    const db = await ready();
    await regenerateWeekList(db, 'w-cur');
    const before = await db.shopping_items.count();
    await db.recipes.delete('mn-kotlety');
    expect(await regenerateWeekList(db, 'w-cur')).toBe('skipped');
    expect(await db.shopping_items.count()).toBe(before);
    expect((await items(db)).size).toBe(before);
  });
});
