import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb, type LocalDb, type Recipe, type RecipeIngredient } from '../../data/db';
import type { Member } from '../family/useFamily';
import { RECIPES, seedMenu } from '../menu/testData';
import { describeTool, runTool, type ToolCtx } from './tools';
import { menuItemId, regenerateWeekList } from '../shop/menuList';
import { deleteRecipe, saveRecipe } from '../ideas/recipeApi';

// Saving a recipe goes to the server; here it lands in the phone's base, as loadContent would bring it.
const saved: { db: LocalDb | null } = { db: null };
vi.mock('../ideas/recipeApi', async () => {
  const { toRows } = await import('../ideas/recipeDraft');
  return {
    saveRecipe: vi.fn(async (household: string, d: Parameters<typeof toRows>[0]) => {
      const { recipe, ingredients } = toRows(d);
      const id = recipe.id as string;
      await saved.db!.recipes.put({ ...recipe, household_id: household, photo_path: null, updated_at: 'x', deleted_at: null } as never);
      await saved.db!.recipe_ingredients.bulkPut(ingredients.map((i) => ({ ...i, recipe_id: id })) as never);
      return id;
    }),
    deleteRecipe: vi.fn(async (r: { id: string }) => { await saved.db!.recipes.update(r.id, { deleted_at: 'x' }); }),
  };
});

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1, kin: 'father' };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false, kin: 'mother' };
const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false, kin: 'son' };
const dima: Member = { ...papa, id: 'm-dima', user_id: null, name: 'Дима', role: 'child', is_owner: false, portion: 0.5, kin: null };
const family = [papa, mama, son, dima];
const TUESDAY = new Date(2026, 9, 13, 14, 30);

const recipe = (id: string, name: string, category: string, extra: Partial<Recipe> = {}): Recipe => ({
  ...RECIPES[0], id, name, about: '', category, meals: category === 'main' ? ['dinner'] : ['lunch'], tags: [], collections: [], time_total: 40, time_active: 20, servings: 4,
  dima_level: 'ok', dima_note: '', steps: ['Приготовить.'], ...extra,
});
const rows = (recipe_id: string, list: Array<[string, number | null]>): RecipeIngredient[] =>
  list.map(([item, qty], pos) => ({ recipe_id, pos, item, qty, to_taste: qty === null, note: '', optional: false }));

async function fresh(opts: { home?: boolean } = {}): Promise<LocalDb> {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db);
  await db.ingredients.bulkPut([
    { item: 'куриное филе', unit: 'г', dept: 'Мясо и птица', grp: 'x', piece_weight: null, piece_name: null, pantry: false },
    { item: 'куриные крылья', unit: 'г', dept: 'Мясо и птица', grp: 'x', piece_weight: null, piece_name: null, pantry: false },
    { item: 'молоко', unit: 'мл', dept: 'Молочное и яйца', grp: 'x', piece_weight: null, piece_name: null, pantry: false },
    { item: 'хлеб белый', unit: 'шт', dept: 'Хлеб', grp: 'x', piece_weight: null, piece_name: null, pantry: false },
  ]);
  await db.recipes.bulkPut([
    recipe('mn-chicken', 'Курица с рисом', 'main', { about: 'Сытно и просто', tags: ['будни', 'детское'] }),
    recipe('mn-wings', 'Острые крылышки', 'main', { dima_level: 'skip', dima_note: 'дать курицу без соуса', time_total: 25, tags: ['быстро'] }),
    recipe('sp-griby', 'Грибной суп', 'soup', { servings: 6 }),
  ]);
  await db.recipe_ingredients.bulkPut([
    ...rows('mn-chicken', [['куриное филе', 600], ['рис', 200]]),
    ...rows('mn-wings', [['куриные крылья', 800]]),
    ...rows('sp-griby', [['грибы', 300], ['картофель', 400]]),
  ]);
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  if (opts.home !== false) await db.meta.put({ key: 'features', value: ['homeCart', 'tripList'] });
  return db;
}
const ctx = (db: LocalDb, me: Member = papa): ToolCtx => ({ db, me, members: family, today: TUESDAY });
const json = (s: string) => JSON.parse(s);
const live = async (db: LocalDb) => (await db.shopping_items.toArray()).filter((i) => !i.deleted_at);

describe('assistant tools: shopping', () => {
  it('adds products to the list with amounts, and undo takes back only its own lines', async () => {
    const db = await fresh();
    const r = await runTool('add_to_shopping', { items: [{ name: 'молоко', amount: 1, unit: 'л' }, { name: 'яйца', amount: 10, unit: 'шт', urgent: true }] }, ctx(db));
    expect(r.error).toBeFalsy();
    expect(r.summary).toBe('В поход: молоко 1 пакет · 900 мл, яйца 10 шт');
    const lines = await live(db);
    expect(lines.map((l) => [l.title, l.qty_text, l.urgent, l.source, l.added_by])).toEqual(expect.arrayContaining([
      ['Молоко', '1 пакет · 900 мл', false, 'manual', 'm-papa'], ['Яйца', '10 шт', true, 'manual', 'm-papa'],
    ]));
    expect(lines.find((l) => l.title === 'Яйца')?.dept).toBe('Молочное и яйца');
    // Someone else adds bread, and the eggs get bought before the undo.
    await runTool('add_to_shopping', { items: [{ name: 'хлеб' }] }, ctx(db, mama));
    const eggs = lines.find((l) => l.title === 'Яйца')!;
    await db.shopping_marks.put({ item_id: eggs.id, household_id: 'h1', bought: true, by_member: 'm-mama', price_real: 110, updated_at: 'x' });
    await r.undo!();
    expect((await live(db)).map((l) => l.title).sort()).toEqual(['Хлеб', 'Яйца']);
  });

  it('does not add a product that is already open on the list', async () => {
    const db = await fresh();
    await runTool('add_to_shopping', { items: [{ name: 'Молоко' }] }, ctx(db, mama));
    const r = await runTool('add_to_shopping', { items: [{ name: 'молоко', amount: 2, unit: 'л' }, { name: 'кефир' }] }, ctx(db));
    expect(json(r.result)).toMatchObject({ added: ['Кефир'], already: ['Молоко'] });
    expect((await live(db)).length).toBe(2);
  });

  it('refuses odd input instead of writing it', async () => {
    const db = await fresh();
    for (const input of [null, {}, { items: 'молоко' }, { items: [] }, { items: [{ name: '   ' }] }, { items: [{ amount: 2 }] }]) {
      const r = await runTool('add_to_shopping', input, ctx(db));
      expect(r.error).toBe(true);
    }
    // A bad amount or unit is dropped, the product still goes in.
    const r = await runTool('add_to_shopping', { items: [{ name: 'сок', amount: -3, unit: 'бочка' }] }, ctx(db));
    expect(r.error).toBeFalsy();
    expect((await live(db))[0]).toMatchObject({ title: 'Сок', qty_text: '1 шт' });
    expect(await db.shopping_items.count()).toBe(1);
  });
});

describe('assistant tools: home', () => {
  it('marks products at home and undo brings back the previous states', async () => {
    const db = await fresh();
    await db.home_stock.put({ household_id: 'h1', key: 'молоко', item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца', state: 'out', by_member: 'm-mama', updated_at: 'x', deleted_at: null });
    const r = await runTool('set_home_stock', { items: [{ name: 'Молоко', state: 'have' }, { name: 'хлеб бородинский', state: 'out' }] }, ctx(db));
    expect(r.error).toBeFalsy();
    expect(r.summary).toBe('Отмечаю дома: молоко — есть, хлеб бородинский — закончилось');
    expect(await db.home_stock.get(['h1', 'молоко'])).toMatchObject({ state: 'have', by_member: 'm-papa' });
    expect(await db.home_stock.get(['h1', 't:хлеб бородинский'])).toMatchObject({ state: 'out', title: 'Хлеб бородинский' });
    // Run out: the product went on the list by itself.
    expect((await live(db)).map((l) => [l.title, l.source])).toEqual([['Хлеб бородинский', 'home']]);
    await r.undo!();
    expect(await db.home_stock.get(['h1', 'молоко'])).toMatchObject({ state: 'out', by_member: 'm-mama' });
    expect((await db.home_stock.get(['h1', 't:хлеб бородинский']))?.deleted_at).toBeTruthy();
    expect(await live(db)).toEqual([]);
  });

  it('undo leaves a product someone changed since', async () => {
    const db = await fresh();
    const r = await runTool('set_home_stock', { items: [{ name: 'молоко', state: 'have' }] }, ctx(db));
    await db.home_stock.put({ ...(await db.home_stock.get(['h1', 'молоко']))!, state: 'out', by_member: 'm-mama' });
    await r.undo!();
    expect(await db.home_stock.get(['h1', 'молоко'])).toMatchObject({ state: 'out', by_member: 'm-mama', deleted_at: null });
  });

  it('says so when the phone has no «Дома» yet', async () => {
    const db = await fresh({ home: false });
    const r = await runTool('set_home_stock', { items: [{ name: 'молоко', state: 'have' }] }, ctx(db));
    expect(r.error).toBe(true);
    expect(await db.home_stock.count()).toBe(0);
  });
});

describe('assistant tools: family, dishes and money', () => {
  it('names the family when a name is not found, and asks by name or by who the person is', async () => {
    const db = await fresh();
    const r = await runTool('ask_family', { to: 'Коля', text: 'Купи хлеб' }, ctx(db));
    expect(r.error).toBe(true);
    expect(r.result).toContain('Коля');
    expect(r.result).toMatch(/Мама.*Сын/);
    expect((await runTool('ask_family', { to: 'Дима', text: 'Убери игрушки' }, ctx(db))).error).toBe(true);
    expect((await runTool('ask_family', { to: 'Папа', text: 'Сам себе' }, ctx(db))).error).toBe(true);
    expect(await db.requests.count()).toBe(0);
    expect(await describeTool('ask_family', { to: 'мама', text: 'Купи хлеб', due: '2026-10-14', urgent: true }, ctx(db))).toBe('Попросить на Доске: Мама — «Купи хлеб» · завтра · срочно');
    const ok = await runTool('ask_family', { to: 'МАМА', text: 'Купи хлеб', due: '2026-10-14', urgent: true }, ctx(db));
    expect(ok.error).toBeFalsy();
    expect(await db.requests.toArray()).toEqual([expect.objectContaining({ from_id: 'm-papa', to_id: 'm-mama', title: 'Купи хлеб', due_on: '2026-10-14', urgent: true, status: 'open' })]);
  });

  it('offers a dish from the base for a day and a meal', async () => {
    const db = await fresh();
    expect((await runTool('offer_dish', { recipe_id: 'nope', date: '2026-10-14', meal: 'dinner', how: 'over' }, ctx(db))).error).toBe(true);
    expect((await runTool('offer_dish', { recipe_id: 'mn-plov', date: '14.10.2026', meal: 'dinner', how: 'over' }, ctx(db))).error).toBe(true);
    expect(await describeTool('offer_dish', { recipe_id: 'mn-plov', date: '2026-10-14', meal: 'dinner', how: 'instead', to: 'Мама' }, ctx(db))).toBe('Предложить блюдо: Плов — завтра на ужин, вместо блюда меню · просим: Мама');
    const r = await runTool('offer_dish', { recipe_id: 'mn-plov', date: '2026-10-14', meal: 'dinner', how: 'instead', to: 'Мама' }, ctx(db));
    expect(r.error).toBeFalsy();
    expect(await db.dish_offers.toArray()).toEqual([expect.objectContaining({ dish_id: 'mn-plov', on_date: '2026-10-14', meal: 'dinner', how: 'instead', to_member: 'm-mama', from_member: 'm-papa', status: 'open' })]);
  });

  it('never files an expense for a child', async () => {
    const db = await fresh();
    const r = await runTool('add_expense', { amount: 500, category: 'Продукты', note: 'Магнит' }, ctx(db, son));
    expect(r.error).toBe(true);
    expect(r.result).toMatch(/нет доступа/i);
    expect(await db.money_entries.count()).toBe(0);
  });

  it('files a parent\'s expense in a known category', async () => {
    const db = await fresh();
    expect(await describeTool('add_expense', { amount: 1249.6, category: 'продукты', note: 'Магнит, продукты' }, ctx(db))).toBe('Внести расход: 1 250 ₽ · Продукты · «Магнит, продукты» · сегодня');
    const r = await runTool('add_expense', { amount: 1249.6, category: 'продукты', note: 'Магнит, продукты' }, ctx(db));
    expect(r.error).toBeFalsy();
    await runTool('add_expense', { amount: 300, category: 'Котики', note: 'Корм', date: '2026-10-12' }, ctx(db));
    const entries = await db.money_entries.toArray();
    expect(entries.map((e) => [e.amount, e.category, e.note, e.on_date, e.kind, e.member_id])).toEqual(expect.arrayContaining([
      [1250, 'Продукты', 'Магнит, продукты', '2026-10-13', 'expense', 'm-papa'], [300, 'Другое', 'Корм', '2026-10-12', 'expense', 'm-papa'],
    ]));
    for (const amount of [0, -5, 'много', 50_000_000]) expect((await runTool('add_expense', { amount, note: 'x' }, ctx(db))).error).toBe(true);
  });

  it('answers an unknown tool with an error', async () => {
    const db = await fresh();
    const r = await runTool('delete_everything', {}, ctx(db));
    expect(r.error).toBe(true);
  });
});

describe('assistant tools: recipes', () => {
  const names = async (db: LocalDb, input: unknown, me: Member = papa) => (json((await runTool('find_recipes', input, ctx(db, me))).result).recipes as Array<{ name: string }>).map((r) => r.name);

  it('finds recipes whatever the case, ё and word endings', async () => {
    const db = await fresh();
    expect(await names(db, { query: 'СЫРНИКОВ' })).toEqual(['Сырники']);
    expect(await names(db, { query: 'печеные яблочки' })).toContain('Печёные яблоки');
    expect(await names(db, { query: 'с курицей' })).toEqual(expect.arrayContaining(['Курица с рисом']));
    // By a product inside, by a tag and by the kind of dish.
    expect(await names(db, { query: 'творог' })).toEqual(['Сырники']);
    expect(await names(db, { query: 'детское' })).toEqual(['Курица с рисом']);
    expect(await names(db, { query: 'суп' })).toEqual(expect.arrayContaining(['Борщ']));
  });

  it('keeps out what the family does not eat and what Dima must not have', async () => {
    const db = await fresh();
    await db.not_eat.bulkPut([
      { household_id: 'h1', kind: 'item', ref: 'грибы', updated_at: 'x', deleted_at: null },
      { household_id: 'h1', kind: 'dish', ref: 'sp-ukha', updated_at: 'x', deleted_at: null },
    ]);
    const soups = await names(db, { meal: 'lunch' });
    expect(soups).toContain('Борщ');
    expect(soups).not.toContain('Грибной суп');
    expect(soups).not.toContain('Уха');
    expect(await names(db, { products: ['курица'] })).toEqual(expect.arrayContaining(['Курица с рисом', 'Острые крылышки']));
    expect(await names(db, { products: ['курица'], for_dima: true })).toEqual(['Курица с рисом']);
    expect(await names(db, { meal: 'dinner', max_minutes: 25 })).toEqual(['Острые крылышки']);
  });

  it('puts first what can be cooked from home', async () => {
    const db = await fresh();
    await db.home_stock.bulkPut([
      { household_id: 'h1', key: 'фарш', item: 'фарш', title: 'Фарш', dept: 'Мясо и птица', state: 'have', by_member: null, updated_at: 'x', deleted_at: null },
      { household_id: 'h1', key: 'рис', item: 'рис', title: 'Рис', dept: 'Бакалея', state: 'have', by_member: null, updated_at: 'x', deleted_at: null },
      { household_id: 'h1', key: 'яйца', item: 'яйца', title: 'Яйца', dept: 'Молочное и яйца', state: 'out', by_member: null, updated_at: 'x', deleted_at: null },
    ]);
    const found = json((await runTool('find_recipes', { meal: 'dinner', from_home: true }, ctx(db))).result).recipes;
    expect(found[0]).toMatchObject({ name: 'Плов', at_home: '2 из 2' });
    expect(found.find((r: { name: string }) => r.name === 'Котлеты')).toMatchObject({ at_home: '1 из 2' });
  });

  it('opens a recipe with amounts for the family', async () => {
    const db = await fresh();
    const r = json((await runTool('get_recipe', { id: 'br-syrniki' }, ctx(db))).result);
    expect(r).toMatchObject({ id: 'br-syrniki', name: 'Сырники', portions: 'на семью, 3,5 порции' });
    expect(r.products).toEqual(['Творог — 450 г', 'Яйца — 1 шт', 'Мука — есть дома']);
    expect(r.steps).toEqual(['Приготовить.']);
    const soup = json((await runTool('get_recipe', { id: 'sp-borsch' }, ctx(db))).result);
    expect(soup.portions).toBe('кастрюля на 8 порций');
    expect(soup.products).toContain('Свёкла — 400 г');
    expect((await runTool('get_recipe', { id: 'nope' }, ctx(db))).error).toBe(true);
    expect((await runTool('get_recipe', {}, ctx(db))).error).toBe(true);
  });
});

describe('assistant tools: the menu', () => {
  async function week() {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.meta.put({ key: 'family_portions', value: 3.5 });
    await regenerateWeekList(db, 'w-cur');
    return db;
  }

  it('puts a dish of the base on the dinner of today and rebuilds the list; undo puts the old one back', async () => {
    const db = await week();
    const r = await runTool('set_meal', { date: '2026-10-13', meal: 'dinner', recipe_id: 'mn-plov' }, ctx(db));
    expect(r.error).toBeFalsy();
    expect(r.summary).toBe('В меню на ужин сегодня: Плов (было: котлеты)');
    expect((await db.week_slots.get(['w-cur', 1, 'dinner']))?.dish_id).toBe('mn-plov');
    expect((await db.shopping_items.get(menuItemId('w-cur', 'рис')))?.deleted_at).toBeNull();
    await r.undo!();
    expect(await db.week_slots.get(['w-cur', 1, 'dinner'])).toMatchObject({ dish_id: 'mn-kotlety', side_id: 'side-grechka' });
    expect((await db.shopping_items.get(menuItemId('w-cur', 'рис')))?.deleted_at).toBeTruthy();
  });

  it('clears a meal when no dish is given', async () => {
    const db = await week();
    const r = await runTool('set_meal', { date: '2026-10-14', meal: 'snack' }, ctx(db));
    expect(r.summary).toBe('Убрать из меню: полдник завтра (было: печёные яблоки)');
    expect((await db.week_slots.get(['w-cur', 2, 'snack']))?.dish_id).toBeNull();
    expect(r.result).toBe('Полдник завтра убран из меню. Покупки пересчитаны.');
  });

  it('lets a child only offer a dish for an approved week, and refuses past days and far weeks', async () => {
    const db = await week();
    expect((await runTool('set_meal', { date: '2026-10-13', meal: 'dinner', recipe_id: 'mn-plov' }, ctx(db, son))).result).toMatch(/только родители.*offer_dish/);
    expect((await runTool('set_meal', { date: '2026-10-12', meal: 'dinner', recipe_id: 'mn-plov' }, ctx(db))).result).toMatch(/уже прошёл/);
    expect((await runTool('set_meal', { date: '2026-10-27', meal: 'dinner', recipe_id: 'mn-plov' }, ctx(db))).result).toMatch(/этой и следующей недели/);
    expect((await db.week_slots.get(['w-cur', 1, 'dinner']))?.dish_id).toBe('mn-kotlety');
  });

  it('makes an empty week for a parent when next week has no menu yet', async () => {
    const db = await week();
    const r = await runTool('set_meal', { date: '2026-10-21', meal: 'dinner', recipe_id: 'mn-plov' }, ctx(db));
    expect(r.error).toBeFalsy();
    const next = await db.weeks.where('[household_id+starts_on]').equals(['h1', '2026-10-19']).first();
    expect(next?.status).toBe('approved');
    expect((await db.week_slots.get([next!.id, 2, 'dinner']))?.dish_id).toBe('mn-plov');
  });

  it('saves a new recipe with dictionary products and names the ones outside it', async () => {
    const db = await fresh();
    saved.db = db;
    const r = await runTool('save_recipe', {
      name: 'Говядина терияки', about: 'С лапшой и овощами', category: 'main', minutes: 45, servings: 4, dima: 'adapt', dima_note: 'без соуса',
      products: [
        { name: 'фарш', amount: 0.4, unit: 'кг' }, { name: 'Яйца', amount: 2, unit: 'шт' }, { name: 'молоко', amount: 2, unit: 'ст. л.' },
        { name: 'соус терияки', amount: 4, unit: 'ст. л.' }, { name: 'рис', amount: 1, unit: 'стакан', note: 'промыть' },
      ],
      steps: ['Обжарить.', 'Потушить.'],
    }, ctx(db));
    expect(r.error).toBeFalsy();
    expect(r.summary).toBe('Сохраняю рецепт: Говядина терияки · 4 продукта, без справочника: соус терияки 4 ст. л.');
    const out = json(r.result);
    expect(out.not_in_dictionary).toEqual(['соус терияки 4 ст. л.']);
    const rec = (await db.recipes.get(out.id))!;
    expect(rec).toMatchObject({ name: 'Говядина терияки', household_id: 'h1', category: 'main', about: 'С лапшой и овощами Ещё нужно: соус терияки 4 ст. л.', dima_level: 'adapt' });
    const ing = await db.recipe_ingredients.where('recipe_id').equals(out.id).sortBy('pos');
    expect(ing.map((x) => [x.item, x.qty, x.note])).toEqual([['фарш', 400, ''], ['яйца', 2, ''], ['молоко', 30, '2 ст. л.'], ['рис', 200, 'промыть, 1 стакан']]);
    await r.undo!();
    expect(deleteRecipe).toHaveBeenCalled();
    expect((await db.recipes.get(out.id))?.deleted_at).toBeTruthy();
  });

  it('asks which product is meant when a short name fits several, and saves nothing', async () => {
    const db = await fresh();
    saved.db = db;
    await db.ingredients.bulkPut([
      { item: 'лук репчатый', unit: 'г', dept: 'Овощи и фрукты', grp: 'x', piece_weight: 90, piece_name: null, pantry: false },
      { item: 'лук зелёный', unit: 'г', dept: 'Овощи и фрукты', grp: 'x', piece_weight: null, piece_name: null, pantry: false },
    ]);
    vi.mocked(saveRecipe).mockClear();
    const r = await runTool('save_recipe', { name: 'Зажарка', category: 'side', minutes: 10, servings: 2, products: [{ name: 'лук', amount: 1, unit: 'шт' }], steps: ['Обжарить.'] }, ctx(db));
    expect(r.result).toMatch(/«лук»: лук (репчатый или лук зелёный|зелёный или лук репчатый)/);
    expect(saveRecipe).not.toHaveBeenCalled();
    const ok = await runTool('save_recipe', { name: 'Зажарка', category: 'side', minutes: 10, servings: 2, products: [{ name: 'лук репчатый', amount: 1, unit: 'шт' }], steps: ['Обжарить.'] }, ctx(db));
    expect((await db.recipe_ingredients.where('recipe_id').equals(json(ok.result).id).first())).toMatchObject({ item: 'лук репчатый', qty: 90 });
  });

  it('saves a recipe and puts it on the menu, as the assistant would chain them', async () => {
    const db = await week();
    saved.db = db;
    const made = json((await runTool('save_recipe', { name: 'Каша с яблоком', category: 'breakfast', minutes: 15, servings: 4, products: [{ name: 'овсяные хлопья', amount: 200, unit: 'г' }, { name: 'яблоки', amount: 300, unit: 'г' }], steps: ['Сварить.'] }, ctx(db))).result);
    const r = await runTool('set_meal', { date: '2026-10-15', meal: 'breakfast', recipe_id: made.id }, ctx(db));
    expect(r.error).toBeFalsy();
    expect((await db.week_slots.get(['w-cur', 3, 'breakfast']))?.dish_id).toBe(made.id);
    expect((await db.shopping_items.get(menuItemId('w-cur', 'яблоки')))?.deleted_at).toBeNull();
  });

  it('does not save the same family recipe twice', async () => {
    const db = await fresh();
    saved.db = db;
    const input = { name: 'Суп дня', category: 'soup', minutes: 30, servings: 6, products: [{ name: 'картофель', amount: 500, unit: 'г' }], steps: ['Сварить.'] };
    const first = json((await runTool('save_recipe', input, ctx(db))).result);
    expect((await runTool('save_recipe', { ...input, name: 'суп дня' }, ctx(db))).result).toContain(`id «${first.id}»`);
  });
});
