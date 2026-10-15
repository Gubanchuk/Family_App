# Recipe Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The family adds, edits and deletes its own recipes, which then appear in «Что покушать» (collection «Наши рецепты»), in «Все рецепты» when replacing a dish, and in shopping lists.

**Architecture:** No new tables: `recipes.household_id` and the existing RLS already allow a family's own rows. Saving goes straight to Supabase (online only), then the content base is reloaded with `loadContent(…, { force: true })`. Own recipes carry `collections: ['ours']` and id `own-<uuid>`; deletion is soft (`deleted_at`), and every recipe list already reads from the local base, so lists filter `deleted_at`.

**Tech Stack:** React 19, TypeScript, supabase-js, Dexie, Vitest, PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-recipe-editor-design.md`

## Global Constraints

- Online only; offline shows «Нет интернета. Рецепт сохранится, когда появится сеть» and keeps the form.
- Ingredients only from the app's vocabulary (`ingredients.item`, foreign key); quantity in the vocabulary unit; «по вкусу» instead of quantity allowed.
- Categories and the meals they allow, same as the base: breakfast → breakfast; soup → lunch; main → dinner, lunch; side → dinner, lunch; salad → lunch, dinner; snack → snack; dessert → snack.
- Save enabled only with name, category, servings ≥ 1, ≥ 1 ingredient, ≥ 1 step.
- Base recipes (household_id null) are never editable.
- Lint stays at 18.

## Review Focus

- A recipe saved while another phone has the base cached — it reaches that phone on its next sync (newest `updated_at` moved). Test in Task 2 (content version moves).
- Deleting a recipe that is in this week's menu — warned first, and the menu still renders («Блюдо не загружено» never appears for it: soft delete keeps the row). Test in Task 3.
- An edit that removes ingredients — the old ingredient rows are gone, not left behind. Test in Task 1 (DB) and Task 2.
- A deleted own recipe — no longer offered in «Что покушать» or «Все рецепты». Test in Task 3.

---

### Task 1: Server rules for own recipes

**Files:** Test: `app/tests/db/recipes-own.test.ts` (no migration expected; add one only if a test shows a gap)

- [ ] **Step 1: DB test**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const MAMA = '00000000-0000-0000-0000-0000000000a5';
const STRANGER = '00000000-0000-0000-0000-0000000000a6';
let db: PGlite;
let hh: string;
const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const recipe = (u: string, h: string, id = 'own-1') => asUser(db, u,
  "insert into public.recipes (id, household_id, name, category, meals, time_active, time_total, servings, protein, dima_level, steps) values ($1, $2, 'Мамины сырники', 'breakfast', '{breakfast}', 20, 25, 4, 'dairy', 'ok', '{Смешать,Обжарить}') on conflict (id) do update set name = excluded.name",
  [id, h]);

describe('own recipes', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [MAMA, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(MAMA, "select public.create_household('Губанчуки', 'Оля', '#E0457B', 'mother') as id"))[0].id;
    await asUser(db, STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB')");
  });

  it('lets a family write its own recipes and their products, and keeps them from other families', async () => {
    await recipe(MAMA, hh);
    await asUser(db, MAMA, "insert into public.recipe_ingredients (recipe_id, pos, item, qty) values ('own-1', 0, (select item from public.ingredients limit 1), 300)");
    await asUser(db, MAMA, "delete from public.recipe_ingredients where recipe_id = 'own-1'");
    expect(await rows(MAMA, "select * from public.recipe_ingredients where recipe_id = 'own-1'")).toEqual([]);
    expect(await rows(STRANGER, "select id from public.recipes where id = 'own-1'")).toEqual([]);
    await expect(recipe(STRANGER, hh, 'own-2')).rejects.toThrow();
  });

  it('never lets a family change a base recipe', async () => {
    const [{ id }] = await rows<{ id: string }>(MAMA, 'select id from public.recipes where household_id is null limit 1');
    await asUser(db, MAMA, "update public.recipes set name = 'Испорчено' where id = $1", [id]);
    expect((await rows<{ name: string }>(MAMA, 'select name from public.recipes where id = $1', [id]))[0].name).not.toBe('Испорчено');
  });
});
```

Run: `cd app && npx vitest run tests/db/recipes-own.test.ts` — Expected: PASS if the existing RLS is right (a characterization test). If a case fails, write the smallest migration that fixes the rule and ledger it.

- [ ] **Step 2: Commit** — `git commit -m "test: pin the rules for a family's own recipes"`

---

### Task 2: Draft, validation and saving

**Files:**
- Create: `app/src/features/ideas/recipeDraft.ts`, `app/src/features/ideas/recipeApi.ts`
- Test: `app/src/features/ideas/recipeDraft.test.ts`

**Interfaces:**
- `type DraftRow = { item: string; qty: string; toTaste: boolean; note: string }`; `type Draft = { id?: string; name: string; about: string; category: Category; time: string; servings: string; dima: 'ok' | 'adapt' | 'skip'; dimaNote: string; rows: DraftRow[]; steps: string[]; source: string }`; `type Category = 'breakfast' | 'soup' | 'main' | 'side' | 'salad' | 'snack' | 'dessert'`.
- `CATEGORY_NAME: Record<Category, string>`, `MEALS_FOR: Record<Category, string[]>`.
- `emptyDraft(): Draft`, `draftFrom(recipe, rows): Draft`, `canSave(d): boolean`, `toRows(d): { recipe: Record<string, unknown>; ingredients: Array<Record<string, unknown>> }` (recipe row: `id` (`own-<uuid>` when new), name/about trimmed, `category`, `meals: MEALS_FOR[category]`, `time_active`/`time_total` = minutes, `servings`, `keeps_days: category === 'soup' ? 2 : 1`, `protein: 'other'`, `tags: []`, `season: ['any']`, `collections: ['ours']`, `dima_level`, `dima_note`, `steps` trimmed non-empty, `source_url`/`source_site` from the link; ingredients with `pos`, `item`, `qty` (null when «по вкусу»), `to_taste`, `note`, `optional: false`).
- `recipeApi.ts`: `saveRecipe(householdId, d): Promise<string>` — upsert recipe, delete its ingredient rows, insert the new ones, then `loadContent(localDb, supabase, { force: true })`; `deleteRecipe(recipe): Promise<void>` — set `deleted_at`, then reload content. Both throw `Error('offline')` when `!navigator.onLine`.

- [ ] **Step 1: Failing test** `recipeDraft.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { canSave, emptyDraft, toRows } from './recipeDraft';

const full = () => ({ ...emptyDraft(), name: ' Мамины сырники ', category: 'breakfast' as const, time: '25', servings: '4', rows: [{ item: 'творог', qty: '500', toTaste: false, note: '' }, { item: 'соль', qty: '', toTaste: true, note: '' }], steps: ['Смешать', ' ', 'Обжарить'] });

describe('own recipe draft', () => {
  it('saves only with a name, a kind, portions, a product and a step', () => {
    expect(canSave(full())).toBe(true);
    expect(canSave({ ...full(), name: ' ' })).toBe(false);
    expect(canSave({ ...full(), rows: [] })).toBe(false);
    expect(canSave({ ...full(), steps: ['  '] })).toBe(false);
    expect(canSave({ ...full(), servings: '0' })).toBe(false);
    expect(canSave({ ...full(), rows: [{ item: 'творог', qty: '', toTaste: false, note: '' }] })).toBe(false);
  });
  it('turns the draft into a recipe of the family with its meals and products', () => {
    const { recipe, ingredients } = toRows(full());
    expect(recipe).toMatchObject({ name: 'Мамины сырники', category: 'breakfast', meals: ['breakfast'], time_total: 25, servings: 4, collections: ['ours'], steps: ['Смешать', 'Обжарить'] });
    expect(String(recipe.id)).toMatch(/^own-/);
    expect(ingredients).toEqual([
      { pos: 0, item: 'творог', qty: 500, to_taste: false, note: '', optional: false },
      { pos: 1, item: 'соль', qty: null, to_taste: true, note: '', optional: false },
    ]);
  });
});
```

Run — FAIL. Implement `recipeDraft.ts` per Interfaces (a row is valid when `item` is set and either `toTaste` or `qty` parses to a number > 0); then `recipeApi.ts`:

```ts
import { supabase } from '../../lib/supabase';
import { localDb } from '../../data/db';
import { loadContent } from '../../data/content';
import type { Recipe } from '../../data/db';
import { toRows, type Draft } from './recipeDraft';

export async function saveRecipe(householdId: string, d: Draft): Promise<string> {
  if (!navigator.onLine) throw new Error('offline');
  const { recipe, ingredients } = toRows(d);
  const r = await supabase.from('recipes').upsert({ ...recipe, household_id: householdId, deleted_at: null });
  if (r.error) throw new Error(r.error.message);
  const del = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id as string);
  if (del.error) throw new Error(del.error.message);
  const ins = await supabase.from('recipe_ingredients').insert(ingredients.map((i) => ({ ...i, recipe_id: recipe.id })));
  if (ins.error) throw new Error(ins.error.message);
  await loadContent(localDb, supabase, { force: true });
  return recipe.id as string;
}

export async function deleteRecipe(r: Recipe) {
  if (!navigator.onLine) throw new Error('offline');
  const { error } = await supabase.from('recipes').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
  if (error) throw new Error(error.message);
  await loadContent(localDb, supabase, { force: true });
}
```

(If `updated_at` on recipes is not stamped by a trigger, include `updated_at: new Date().toISOString()` in the upsert and the update so other phones see the base version move.)

- [ ] **Step 2: Commit** — `git commit -m "feat: own recipe drafts, checks and saving"`

---

### Task 3: Editor screen and its places in the app

**Files:**
- Create: `app/src/features/ideas/RecipeEditor.tsx`
- Modify: `app/src/features/ideas/IdeasPanel.tsx` («Свой рецепт», «Наши рецепты» first, deleted filtered), `app/src/features/ideas/RecipeSheet.tsx` («Изменить»/«Удалить» for own recipes), `app/src/features/ideas/offerActions.ts` (`COLLECTIONS` gains `{ id: 'ours', name: 'Наши рецепты' }` first), `app/src/features/menu/SlotSheet.tsx` (filter `deleted_at` in «Все рецепты»)
- Test: `app/src/features/ideas/RecipeEditor.test.tsx`

**Interfaces:** `<RecipeEditor me db recipe? onClose />` — full-height `Sheet` titled «Свой рецепт» / «Изменить рецепт»; product search over `db.ingredients` (first 8 matches by `item.includes(query)`, tap adds a row); unit shown from the vocabulary; steps list with «Добавить шаг», «Убрать», «Выше»; «Сохранить» calls `saveRecipe` (mocked in tests), shows «Рецепт сохранён» and closes; on `offline` shows the spec's message and stays open.

- [ ] **Step 1: Failing test** `RecipeEditor.test.tsx` — with `vi.mock('./recipeApi', () => ({ saveRecipe: vi.fn(async () => 'own-1'), deleteRecipe: vi.fn() }))`, a local db seeded with two vocabulary items (`творог` г, `яйца` шт): type the name, pick «Завтрак», portions 4, search «тво» → tap «Творог» → quantity 500, add step «Смешать», Save → `saveRecipe` called with a draft containing those values; and a test that Save stays disabled until a step exists.

- [ ] **Step 2: Implement** the editor and the wiring; in `IdeasPanel` lists drop `r.deleted_at` recipes and «Наши рецепты» chip shows only when the family has own recipes; `RecipeSheet` shows «Изменить» and «Удалить» when `recipe.household_id` is set; «Удалить» asks «Блюдо есть в меню на неделю. Удалить всё равно?» when the dish is in this or next week's slots, otherwise «Удалить рецепт?».

- [ ] **Step 3: Run** `cd app && npx vitest run src/features/ideas src/features/menu && npx tsc -b && npm run lint` — PASS, lint 18. Screenshot the editor in the dev preview (add `/dev/recipe-new`) day and night and fix what looks off.

- [ ] **Step 4: Commit** — `git commit -m "feat: add, edit and delete the family's own recipes"`

---

### Task 4: End-to-end (live project; no migration needed)

`app/e2e/recipes.spec.ts`: mom opens «Что покушать» → «Свой рецепт», fills it, saves; the son's «Что покушать» shows it under «Наши рецепты» after a reload. Run `cd app && npx playwright test -c e2e/playwright.config.ts recipes.spec.ts`. This one can run tonight: it needs no new migration.
