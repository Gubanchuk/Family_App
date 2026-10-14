import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import { saveWeekAsTemplate } from './saveTemplate';
import { seedMenu } from './testData';

describe('saveWeekAsTemplate', () => {
  it('copies the week with all replacements into a family template', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.week_slots.update(['w-cur', 2, 'dinner'], { dish_id: 'mn-plov' });
    const week = (await db.weeks.get('w-cur'))!;
    const slots = await db.week_slots.where('week_id').equals('w-cur').toArray();
    const id = await saveWeekAsTemplate(db, week, slots, 'Наша осень');
    expect(id).toMatch(/^h-/);
    expect((await db.week_templates.get(id))?.household_id).toBe('h1');
    expect((await db.template_slots.get([id, 2, 'dinner']))?.dish_id).toBe('mn-plov');
    expect(await db.template_slots.where('template_id').equals(id).count()).toBe(28);
  });
});
