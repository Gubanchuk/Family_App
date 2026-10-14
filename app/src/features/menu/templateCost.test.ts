import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import { seedMenu } from './testData';
import { templateCosts } from './templateCost';

describe('templateCosts', () => {
  it('prices each template the way its shopping list would, for the family portions', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    await db.meta.put({ key: 'family_portions', value: 3.5 });
    const costs = await templateCosts(db);
    // Plov and buckwheat daily, syrniki 4 days, oatmeal 3 days, one pot of ukha; apples have no price.
    expect(costs.get('quick')).toBeCloseTo(220.5 + 1225 + 153.125 + 1050 + 42 + 52.5 + 200 + 10.5, 3);
    expect(costs.has('autumn')).toBe(true);
  });

  it('leaves out a template whose dishes have not downloaded yet', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    await db.recipes.delete('mn-plov');
    expect((await templateCosts(db)).has('quick')).toBe(false);
  });
});
