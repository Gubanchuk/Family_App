# Покупки, «Что покушать», Главная и пуши — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** закрыть первый срез. Утверждённая неделя сама собирает список покупок с количествами и ценой. Семья отмечает покупки и видит отметки друг друга, в том числе без сети. В «Что покушать» блюдо предлагают члену семьи. Главная показывает главное на сегодня. Три события приходят пушами.

**Architecture:**
- Всё новое живёт в той же схеме, что и меню: таблица в Supabase с RLS, копия в Dexie, запись через `writeLocal` и очередь.
- Список покупок из меню собирает телефон родителя, который утвердил или изменил неделю. У позиций детерминированные id (`m:<неделя>:<продукт>`), поэтому два телефона приходят к одному и тому же списку.
- Отметка «куплено» хранится в отдельной таблице `shopping_marks`. Пересчёт списка её не трогает.
- Пуши уходят из Edge Function `notify`. Её вызывает триггер базы через `pg_net` после вставки строки. Шифрование — RFC 8291 на Web Crypto.

Это третий план среза:
- первый — `docs/superpowers/plans/2026-10-14-foundation.md`;
- второй — `docs/superpowers/plans/2026-10-14-menu-offline.md`.

**Tech Stack:** то, что уже есть. Новое только в серверной части: Supabase Edge Functions (Deno) и `pg_net`.

**Spec:** `docs/superpowers/specs/2026-10-13-family-app-design.md`. Нужные разделы:
- «Первый срез» — Покупки, «Что покушать», Главная;
- «Каркас» — пуши;
- «Модель данных первого среза» — как собирается список.

Внешний вид — `mockups/v-cards.js`: функции `home`, `menuIdeas`, `ideaSheet`, `shop`, `settings`. Стили — `mockups/styles.css`, токены — `DESIGN.md`.

## Global Constraints

- Все ограничения планов 1 и 2 в силе:
  - русский интерфейс;
  - коммит и пуш в `main` после каждой задачи;
  - миграции выкладываются через `npx supabase@2 db push --yes`.
- **Порции.** Доли берутся из профилей (`members.portion`): сейчас 1 + 1 + 1 + 0,5 = 3,5. Если профилей ещё нет, считаем 3,5.
- **Суп.** Одна кастрюля — целый рецепт один раз. Кастрюля — подряд идущие дни с одним и тем же супом.
- **«Всегда есть дома».** Продукты с `pantry = true` в список не идут.
- **Пересчёт после утверждения.** Пересчитываются только позиции из меню, которые ещё не куплены.
- **Цены.** Цена — `prices.price_per_unit` × количество. Если у продукта нет цены, сумма показывается как «≈ N ₽ без M продуктов».
- **Пуши в первом срезе — три:**
  - предложена неделя (настройка `votes`);
  - предложено блюдо (`offers`);
  - кто-то идёт в магазин (`shop`).

  Тихие часы `quiet` (22:00–8:00) — без звука, а не без пуша.
- **Ключи пушей.** Закрытый ключ VAPID хранится только в секретах Supabase. В репозиторий, в чат и в файлы проекта он не попадает. Открытый ключ лежит в коде.
- **Почта владельца.** Никуда не отправляется. Поле `sub` у VAPID — `https://github.com/Gubanchuk/Family_App`.

## Review Focus

1. **Неделю правят после того, как часть продуктов купили.** Купленные позиции остаются как были. Некупленные пересчитываются, ненужные исчезают. Тест — задача 4.
2. **Два телефона в магазине, один без сети.** Отметки не теряются и не переключаются обратно. Это установка значения, а не переключение. Отметка без сети уходит, когда сеть появляется. Тесты — задачи 3 и 5.
3. **Ребёнок предлагает блюдо от имени мамы или берёт его за папу.** Сервер отказывает. Тест — задача 1.
4. **Рецептов на телефоне ещё нет** (первый запуск, база не скачалась). Пересчёт списка ничего не удаляет и не портит. Тест — задача 4.
5. **Пуш дошёл до сервиса пушей.** Расшифровка по RFC 8291 даёт исходный текст, подпись VAPID проверяется открытым ключом. Тест — задача 10.

---

### Task 1: Схема покупок, предложений и пушей

**Files:**
- Create: `supabase/migrations/20261014000700_shopping.sql`
- Create: `app/tests/db/shopping.test.ts`

**Interfaces:**
- Consumes: `households`, `members`, `my_household_ids`, `is_parent`, `touch_updated_at`, `weeks`, `recipes`, `ingredients` (миграции 0200–0600).
- Produces: таблицы
  - `dish_offers` — id uuid, household_id, from_member, to_member (null — всем), dish_id, on_date, meal, how 'over'|'instead', status 'open'|'taken'|'declined', taken_by, updated_at, deleted_at;
  - `shopping_items` — id text, household_id, week_id, offer_id, source 'menu'|'manual'|'offer', item, title, qty, unit, qty_text, dept, urgent, est_price, added_by, updated_at, deleted_at;
  - `shopping_marks` — item_id, household_id, bought, by_member, price_real, updated_at;
  - `shop_trips` — id, household_id, member_id, started_at, updated_at;
  - `not_eat` — household_id, kind 'item'|'dish', ref, updated_at, deleted_at;
  - `push_subscriptions` — endpoint, household_id, member_id, p256dh, auth, updated_at;
  - `push_log` — kind, ref_id, sent_at; только для сервера.

  Функция `my_member_ids()`. Ошибки `not_yours` и `wrong_household`.

- [ ] **Step 1: Падающие тесты**

`app/tests/db/shopping.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000c1';
const MAMA = '00000000-0000-0000-0000-0000000000c2';
const SON = '00000000-0000-0000-0000-0000000000c3';
const STRANGER = '00000000-0000-0000-0000-0000000000c4';
let db: PGlite;
let hh: string;
const id: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;

describe('shopping schema', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const u of [PAPA, MAMA, SON, STRANGER]) await addUser(db, u);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB') as id"))[0].id;
    await asUser(db, MAMA, "select public.accept_invite($1, 'Мама', '#E0457B')", [await invite('parent')]);
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [await invite('child')]);
    for (const [k, u] of [['papa', PAPA], ['mama', MAMA], ['son', SON]]) id[k] = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [u]))[0].id;
    await asUser(db, PAPA, "insert into public.shopping_items (id, household_id, source, item, title, qty, unit, qty_text, dept, est_price) values ('m:x:картофель', $1, 'menu', 'картофель', 'Картофель', 3000, 'г', '3 кг', 'Овощи и фрукты', 105)", [hh]);
  });

  it('shares a purchase mark with the whole family and nobody else', async () => {
    await asUser(db, SON, "insert into public.shopping_marks (item_id, household_id, bought, by_member) values ('m:x:картофель', $1, true, $2)", [hh, id.son]);
    expect(await rows(MAMA, 'select bought from public.shopping_marks')).toEqual([{ bought: true }]);
    expect(await rows(STRANGER, 'select * from public.shopping_marks')).toEqual([]);
    expect(await rows(STRANGER, 'select * from public.shopping_items')).toEqual([]);
  });

  it('lets a child add an urgent item by hand', async () => {
    await asUser(db, SON, "insert into public.shopping_items (id, household_id, source, title, qty_text, dept, urgent, added_by) values ('u:1', $1, 'manual', 'Бананы', '1 кг', 'Овощи и фрукты', true, $2)", [hh, id.son]);
    expect(await rows(PAPA, "select title, urgent from public.shopping_items where id = 'u:1'")).toEqual([{ title: 'Бананы', urgent: true }]);
  });

  it('refuses a mark that points at another family', async () => {
    const other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Кто-то', '#000000') as id"))[0].id;
    await expect(asUser(db, STRANGER, "insert into public.shopping_marks (item_id, household_id, bought) values ('m:x:картофель', $1, true)", [other])).rejects.toThrow();
  });

  it('lets a member offer a dish only as themselves', async () => {
    const ins = (from: string, who: string) => asUser(db, who, "insert into public.dish_offers (household_id, from_member, to_member, dish_id, on_date, meal, how) values ($1, $2, $3, 'mn-plov', '2026-10-14', 'dinner', 'over') returning id", [hh, from, id.papa]);
    await expect(ins(id.mama, SON)).rejects.toThrow(/not_yours/);
    const offer = (await ins(id.son, SON)).rows[0] as { id: string };
    await expect(asUser(db, SON, "update public.dish_offers set status = 'taken', taken_by = $2 where id = $1", [offer.id, id.papa])).rejects.toThrow(/not_yours/);
    await asUser(db, PAPA, "update public.dish_offers set status = 'taken', taken_by = $2 where id = $1", [offer.id, id.papa]);
    expect(await rows(SON, 'select status from public.dish_offers')).toEqual([{ status: 'taken' }]);
  });

  it('lets the recipient take an offer through an upsert', async () => {
    const offer = (await rows<Record<string, unknown>>(MAMA, "insert into public.dish_offers (household_id, from_member, to_member, dish_id, on_date, meal, how) values ($1, $2, $3, 'mn-plov', '2026-10-14', 'dinner', 'instead') returning *", [hh, id.mama, id.papa]))[0];
    await asUser(db, PAPA, `insert into public.dish_offers (id, household_id, from_member, to_member, dish_id, on_date, meal, how, status, taken_by)
      values ($1, $2, $3, $4, 'mn-plov', '2026-10-14', 'dinner', 'instead', 'taken', $4)
      on conflict (id) do update set status = excluded.status, taken_by = excluded.taken_by`, [offer.id, hh, id.mama, id.papa]);
    expect(await rows(MAMA, 'select status from public.dish_offers')).toEqual([{ status: 'taken' }]);
  });

  it('lets only parents edit what the family does not eat', async () => {
    await expect(asUser(db, SON, "insert into public.not_eat (household_id, kind, ref) values ($1, 'item', 'грибы')", [hh])).rejects.toThrow();
    await asUser(db, MAMA, "insert into public.not_eat (household_id, kind, ref) values ($1, 'item', 'грибы')", [hh]);
    expect(await rows(SON, 'select ref from public.not_eat')).toEqual([{ ref: 'грибы' }]);
  });

  it('records a shop trip only as yourself', async () => {
    await expect(asUser(db, SON, 'insert into public.shop_trips (household_id, member_id) values ($1, $2)', [hh, id.papa])).rejects.toThrow();
    await asUser(db, SON, 'insert into public.shop_trips (household_id, member_id) values ($1, $2)', [hh, id.son]);
    expect(await rows(PAPA, 'select member_id from public.shop_trips')).toEqual([{ member_id: id.son }]);
  });

  it('keeps push subscriptions private to their owner and the log to the server', async () => {
    await asUser(db, SON, "insert into public.push_subscriptions (endpoint, household_id, member_id, p256dh, auth) values ('https://push.example/1', $1, $2, 'k', 'a')", [hh, id.son]);
    expect(await rows(PAPA, 'select * from public.push_subscriptions')).toEqual([]);
    expect(await rows(SON, 'select endpoint from public.push_subscriptions')).toEqual([{ endpoint: 'https://push.example/1' }]);
    await expect(asUser(db, PAPA, 'select * from public.push_log')).rejects.toThrow();
  });
});
```

Run: `npm test -- tests/db/shopping.test.ts`
Expected: FAIL — `relation "public.shopping_items" does not exist`.

- [ ] **Step 2: Миграция**

`supabase/migrations/20261014000700_shopping.sql`:

```sql
create function public.my_member_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and deleted_at is null
$$;
grant execute on function public.my_member_ids() to authenticated;

create table public.dish_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_member uuid not null references public.members (id) on delete cascade,
  to_member uuid references public.members (id) on delete cascade,
  dish_id text not null references public.recipes (id),
  on_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  how text not null check (how in ('over', 'instead')),
  status text not null default 'open' check (status in ('open', 'taken', 'declined')),
  taken_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shopping_items (
  id text primary key check (length(id) between 3 and 160),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid references public.weeks (id) on delete cascade,
  offer_id uuid references public.dish_offers (id) on delete cascade,
  source text not null check (source in ('menu', 'manual', 'offer')),
  item text references public.ingredients (item),
  title text not null check (length(title) between 1 and 80),
  qty numeric,
  unit text,
  qty_text text not null default '' check (length(qty_text) <= 40),
  dept text not null,
  urgent boolean not null default false,
  est_price numeric,
  added_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shopping_marks (
  item_id text primary key references public.shopping_items (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  bought boolean not null,
  by_member uuid references public.members (id) on delete set null,
  price_real numeric check (price_real is null or price_real >= 0),
  updated_at timestamptz not null default now()
);

create table public.shop_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.not_eat (
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('item', 'dish')),
  ref text not null check (length(ref) between 1 and 80),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (household_id, kind, ref)
);

create table public.push_subscriptions (
  endpoint text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

-- Written only by the notify Edge Function with the service role: one row per event already pushed.
create table public.push_log (
  kind text not null,
  ref_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id)
);

create trigger dish_offers_touch before insert or update on public.dish_offers for each row execute function public.touch_updated_at();
create trigger shopping_items_touch before insert or update on public.shopping_items for each row execute function public.touch_updated_at();
create trigger shopping_marks_touch before insert or update on public.shopping_marks for each row execute function public.touch_updated_at();
create trigger shop_trips_touch before insert or update on public.shop_trips for each row execute function public.touch_updated_at();
create trigger not_eat_touch before insert or update on public.not_eat for each row execute function public.touch_updated_at();
create trigger push_subscriptions_touch before insert or update on public.push_subscriptions for each row execute function public.touch_updated_at();

-- An upsert fires BEFORE INSERT even when it ends as an update, so the insert branch
-- checks the author only for a row that does not exist yet; the update branch covers the rest.
create function public.guard_offer() returns trigger language plpgsql security definer set search_path = public as $$
declare existing boolean := false;
begin
  if tg_op = 'INSERT' then
    existing := exists (select 1 from public.dish_offers where id = new.id);
    if not existing and new.from_member not in (select public.my_member_ids()) then raise exception 'not_yours'; end if;
    if not existing and new.status = 'taken' and (new.taken_by is null or new.taken_by not in (select public.my_member_ids())) then raise exception 'not_yours'; end if;
  else
    if new.from_member <> old.from_member or new.household_id <> old.household_id or new.dish_id <> old.dish_id then raise exception 'not_yours'; end if;
    if new.status = 'taken' and (old.status <> 'taken' or new.taken_by is distinct from old.taken_by)
       and (new.taken_by is null or new.taken_by not in (select public.my_member_ids())) then raise exception 'not_yours'; end if;
  end if;
  if not exists (select 1 from public.members where id = new.from_member and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  if new.to_member is not null and not exists (select 1 from public.members where id = new.to_member and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger dish_offers_guard before insert or update on public.dish_offers for each row execute function public.guard_offer();

create function public.guard_shopping_item() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.week_id is not null and not exists (select 1 from public.weeks where id = new.week_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  if new.offer_id is not null and not exists (select 1 from public.dish_offers where id = new.offer_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger shopping_items_guard before insert or update on public.shopping_items for each row execute function public.guard_shopping_item();

create function public.guard_mark() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.shopping_items where id = new.item_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger shopping_marks_guard before insert or update on public.shopping_marks for each row execute function public.guard_mark();

alter table public.dish_offers enable row level security;
alter table public.shopping_items enable row level security;
alter table public.shopping_marks enable row level security;
alter table public.shop_trips enable row level security;
alter table public.not_eat enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;

create policy "family reads offers" on public.dish_offers for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds offers" on public.dish_offers for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates offers" on public.dish_offers for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads items" on public.shopping_items for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds items" on public.shopping_items for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates items" on public.shopping_items for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads marks" on public.shopping_marks for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds marks" on public.shopping_marks for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates marks" on public.shopping_marks for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads trips" on public.shop_trips for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "members start their own trips" on public.shop_trips for insert to authenticated
  with check (household_id in (select public.my_household_ids()) and member_id in (select public.my_member_ids()));
create policy "members edit their own trips" on public.shop_trips for update to authenticated
  using (member_id in (select public.my_member_ids())) with check (member_id in (select public.my_member_ids()));

create policy "family reads not_eat" on public.not_eat for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "parents add not_eat" on public.not_eat for insert to authenticated with check (public.is_parent(household_id));
create policy "parents edit not_eat" on public.not_eat for update to authenticated using (public.is_parent(household_id)) with check (public.is_parent(household_id));

create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()) and household_id in (select public.my_household_ids()));

grant select, insert, update on public.dish_offers, public.shopping_items, public.shopping_marks, public.shop_trips, public.not_eat to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_log from anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dish_offers, public.shopping_items, public.shopping_marks, public.shop_trips, public.not_eat;
  end if;
end $$;
```

- [ ] **Step 3: Тесты проходят, выкладка, коммит**

Run: `npm test -- tests/db`
Expected: PASS, в том числе shopping (8).

```bash
npx --yes supabase@2 db push --yes
git add supabase/migrations app/tests/db && git commit -m "feat: add shopping items, marks, dish offers, trips and push tables" && git push origin main
```

---

### Task 2: Сборка списка из меню

**Files:**
- Create: `app/src/features/shop/build.ts`, `app/src/features/shop/build.test.ts`, `app/tests/shop-parity.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `RecipeIngredient`, `SimpleSnack` (`app/src/data/db.ts`); `Meal`, `MEALS` (`app/src/features/menu/week.ts`).
- Produces:
  - `SlotIn` — `{ day: number; meal: Meal; dish_id: string | null; side_id: string | null; salad_id: string | null; simple: SimpleSnack | null }`;
  - `ListLine` — `{ item: string; qty: number | null; unit: string; dept: string; est: number | null }`;
  - `BuildInput` — `{ slots: SlotIn[]; servings: Map<string, number>; ingredientsOf: Map<string, Array<{ item: string; qty: number | null }>>; vocab: Map<string, Ingredient>; prices: Map<string, number>; portions: number }`;
  - `buildMenuList(inp: BuildInput): ListLine[]`;
  - `formatQty(qty: number | null, unit: string): string`;
  - `rub(n: number): string` — «1 050 ₽»;
  - `DEPT_ORDER: string[]`, `deptRank(dept: string): number`;
  - `listTotals(rows: Array<{ est: number | null; real: number | null; bought: boolean }>): { count; doneCount; bought; left; unpriced }`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/shop/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../../data/db';
import { buildMenuList, formatQty, listTotals, rub, type SlotIn } from './build';

const v = (item: string, unit: string, dept: string, pantry = false): Ingredient => ({ item, unit, dept, grp: 'x', piece_weight: null, piece_name: null, pantry });
const vocab = new Map([
  v('творог', 'г', 'Молочное и яйца'), v('яйца', 'шт', 'Молочное и яйца'), v('мука', 'г', 'Бакалея', true),
  v('свёкла', 'г', 'Овощи и фрукты'), v('фарш', 'г', 'Мясо и птица'), v('гречка', 'г', 'Бакалея'), v('кефир', 'мл', 'Молочное и яйца'), v('зелень', 'г', 'Овощи и фрукты'),
].map((x) => [x.item, x]));
const servings = new Map([['syr', 4], ['borsch', 8], ['kotl', 4], ['grech', 4]]);
const ingredientsOf = new Map([
  ['syr', [{ item: 'творог', qty: 500 }, { item: 'яйца', qty: 1 }, { item: 'мука', qty: 60 }]],
  ['borsch', [{ item: 'свёкла', qty: 400 }, { item: 'зелень', qty: null }]],
  ['kotl', [{ item: 'фарш', qty: 600 }, { item: 'яйца', qty: 1 }]],
  ['grech', [{ item: 'гречка', qty: 250 }]],
]);
const prices = new Map([['творог', 0.6], ['яйца', 12], ['свёкла', 0.04], ['фарш', 0.5], ['гречка', 0.1]]);
const slot = (day: number, meal: SlotIn['meal'], dish: string | null, side: string | null = null, simple: SlotIn['simple'] = null): SlotIn => ({ day, meal, dish_id: dish, side_id: side, salad_id: null, simple });
const build = (slots: SlotIn[], portions = 3.5) => buildMenuList({ slots, servings, ingredientsOf, vocab, prices, portions });
const line = (lines: ReturnType<typeof build>, item: string) => lines.find((l) => l.item === item);

describe('buildMenuList', () => {
  it('scales every dish to the family portions', () => {
    const l = build([slot(0, 'breakfast', 'syr'), slot(1, 'breakfast', 'syr')]);
    expect(line(l, 'творог')?.qty).toBeCloseTo(500 * (3.5 / 4) * 2);
    expect(line(l, 'яйца')?.qty).toBeCloseTo(1.75);
  });

  it('counts a soup once per pot of consecutive days and again after a break', () => {
    const l = build([slot(0, 'lunch', 'borsch'), slot(1, 'lunch', 'borsch'), slot(2, 'lunch', 'borsch'), slot(4, 'lunch', 'borsch')]);
    expect(line(l, 'свёкла')?.qty).toBe(800);
  });

  it('leaves out what is always at home and keeps to-taste items without a number', () => {
    const l = build([slot(0, 'breakfast', 'syr'), slot(0, 'lunch', 'borsch')]);
    expect(line(l, 'мука')).toBeUndefined();
    expect(line(l, 'зелень')).toEqual({ item: 'зелень', qty: null, unit: 'г', dept: 'Овощи и фрукты', est: null });
  });

  it('adds sides and simple snacks per person', () => {
    const l = build([slot(0, 'dinner', 'kotl', 'grech'), slot(0, 'snack', null, null, { simple: 'Кефир', items: [{ item: 'кефир', qty: 200 }] })]);
    expect(line(l, 'гречка')?.qty).toBeCloseTo(250 * 0.875);
    expect(line(l, 'кефир')?.qty).toBe(700);
    expect(line(l, 'кефир')?.est).toBeNull();
  });

  it('prices lines and sorts them in store order', () => {
    const l = build([slot(0, 'dinner', 'kotl', 'grech'), slot(0, 'breakfast', 'syr')]);
    expect(line(l, 'фарш')?.est).toBeCloseTo(600 * 0.875 * 0.5);
    expect(l.map((x) => x.dept)).toEqual(['Молочное и яйца', 'Молочное и яйца', 'Мясо и птица', 'Бакалея']);
  });
});

describe('formatQty and money', () => {
  it('rounds weights up for the shop', () => {
    expect(formatQty(1750, 'г')).toBe('1,8 кг');
    expect(formatQty(975, 'г')).toBe('1 кг');
    expect(formatQty(410, 'г')).toBe('450 г');
    expect(formatQty(20, 'г')).toBe('50 г');
    expect(formatQty(1500, 'мл')).toBe('1,5 л');
    expect(formatQty(9.625, 'шт')).toBe('10 шт');
    expect(formatQty(null, 'г')).toBe('по вкусу');
  });
  it('formats rubles', () => {
    expect(rub(1050.4).replace(/\s/g, ' ')).toBe('1 050 ₽');
  });
  it('totals bought and left, counting items without a price', () => {
    expect(listTotals([
      { est: 100, real: 120, bought: true }, { est: 50, real: null, bought: true },
      { est: 300, real: null, bought: false }, { est: null, real: null, bought: false },
    ])).toEqual({ count: 4, doneCount: 2, bought: 170, left: 300, unpriced: 1 });
  });
});
```

`app/tests/shop-parity.test.ts` сверяет сумму с `content/tools/week_cost.py`. Числа «food» получены запуском этого скрипта 14.10.2026:

```ts
// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMenuList, type SlotIn } from '../src/features/shop/build';
import type { Ingredient } from '../src/data/db';

const root = resolve(__dirname, '../..');
const read = (p: string) => JSON.parse(readFileSync(join(root, 'content', p), 'utf8'));
// Food cost per template from `python content/tools/week_cost.py .` on 2026-10-14 (pantry excluded).
const FOOD: Record<string, number> = { autumn: 9048, winter: 9527, spring: 11530, summer: 9379, budget: 7223, quick: 8116 };

describe('shopping list cost matches the week cost script', () => {
  const vocab = new Map<string, Ingredient>(read('ingredients.json').map((x: Record<string, unknown>) => [x.item, { item: x.item, unit: x.unit, dept: x.dept, grp: x.group, piece_weight: x.pieceWeight ?? null, piece_name: x.pieceName ?? null, pantry: !!x.pantry }]));
  const prices = new Map<string, number>(read('prices.json').prices.map((p: { item: string; pricePerUnit: number }) => [p.item, p.pricePerUnit]));
  const servings = new Map<string, number>();
  const ingredientsOf = new Map<string, Array<{ item: string; qty: number | null }>>();
  for (const f of readdirSync(join(root, 'content', 'recipes')).filter((x) => x.endsWith('.json'))) {
    for (const r of read(`recipes/${f}`).recipes) {
      servings.set(r.id, r.servings);
      ingredientsOf.set(r.id, r.ingredients.map((i: { item: string; qty?: number }) => ({ item: i.item, qty: i.qty ?? null })));
    }
  }
  for (const w of read('weeks.json')) {
    it(`${w.id}`, () => {
      const slots: SlotIn[] = [];
      w.days.forEach((d: Record<string, any>, day: number) => {
        const lunch = d.lunch ?? {}; const dinner = d.dinner ?? {}; const snack = d.snack;
        slots.push({ day, meal: 'breakfast', dish_id: d.breakfast ?? null, side_id: null, salad_id: null, simple: null });
        slots.push({ day, meal: 'lunch', dish_id: lunch.soup ?? null, side_id: null, salad_id: lunch.salad ?? null, simple: null });
        slots.push({ day, meal: 'snack', dish_id: typeof snack === 'string' ? snack : null, side_id: null, salad_id: null, simple: typeof snack === 'object' ? snack : null });
        slots.push({ day, meal: 'dinner', dish_id: dinner.main ?? null, side_id: dinner.side ?? null, salad_id: dinner.salad ?? null, simple: null });
      });
      const total = buildMenuList({ slots, servings, ingredientsOf, vocab, prices, portions: 3.5 }).reduce((s, l) => s + (l.est ?? 0), 0);
      expect(Math.abs(Math.round(total) - FOOD[w.id])).toBeLessThanOrEqual(1);
    });
  }
});
```

Run: `npm test -- src/features/shop tests/shop-parity.test.ts`
Expected: FAIL — модуль `build` не найден.

- [ ] **Step 2: Реализация**

`app/src/features/shop/build.ts`:

```ts
import type { Ingredient, SimpleSnack } from '../../data/db';
import { MEALS, type Meal } from '../menu/week';

export type SlotIn = { day: number; meal: Meal; dish_id: string | null; side_id: string | null; salad_id: string | null; simple: SimpleSnack | null };
export type ListLine = { item: string; qty: number | null; unit: string; dept: string; est: number | null };
export type BuildInput = {
  slots: SlotIn[];
  servings: Map<string, number>;
  ingredientsOf: Map<string, Array<{ item: string; qty: number | null }>>;
  vocab: Map<string, Ingredient>;
  prices: Map<string, number>;
  portions: number;
};

export const DEPT_ORDER = ['Овощи и фрукты', 'Хлеб', 'Молочное и яйца', 'Мясо и птица', 'Рыба', 'Заморозка', 'Бакалея', 'Консервы и соусы', 'Специи', 'Другое'];
export const deptRank = (d: string) => { const i = DEPT_ORDER.indexOf(d); return i < 0 ? DEPT_ORDER.length : i; };

// Mirrors content/tools/week_cost.py so the list and the template prices agree.
export function buildMenuList(inp: BuildInput): ListLine[] {
  const qty = new Map<string, number | null>();
  const add = (rows: Array<{ item: string; qty: number | null }>, factor: number) => {
    for (const r of rows) {
      if (inp.vocab.get(r.item)?.pantry) continue;
      if (r.qty === null || r.qty === undefined) { if (!qty.has(r.item)) qty.set(r.item, null); continue; }
      qty.set(r.item, (qty.get(r.item) ?? 0) + Number(r.qty) * factor);
    }
  };
  const dish = (id: string | null) => {
    const serv = id ? inp.servings.get(id) : undefined;
    if (id && serv) add(inp.ingredientsOf.get(id) ?? [], inp.portions / serv);
  };
  const slots = [...inp.slots].sort((a, b) => a.day - b.day || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  // A pot of soup is cooked once for consecutive days: the whole recipe, not per portion.
  let prevSoup: string | null = null;
  for (let day = 0; day < 7; day += 1) {
    const soup = slots.find((s) => s.day === day && s.meal === 'lunch')?.dish_id ?? null;
    if (soup && soup !== prevSoup) add(inp.ingredientsOf.get(soup) ?? [], 1);
    prevSoup = soup;
  }
  for (const s of slots) {
    if (s.meal !== 'lunch') dish(s.dish_id);
    dish(s.side_id);
    dish(s.salad_id);
    if (s.simple) add(s.simple.items, inp.portions);
  }
  const out: ListLine[] = [];
  for (const [item, q] of qty) {
    const v = inp.vocab.get(item);
    const price = inp.prices.get(item);
    out.push({ item, qty: q, unit: v?.unit ?? 'г', dept: v?.dept ?? 'Другое', est: q !== null && price !== undefined ? q * price : null });
  }
  return out.sort((a, b) => deptRank(a.dept) - deptRank(b.dept) || a.item.localeCompare(b.item, 'ru'));
}

const dec = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export function formatQty(qty: number | null, unit: string): string {
  if (qty === null) return 'по вкусу';
  if (unit === 'шт') return `${Math.max(1, Math.ceil(qty - 0.05))} шт`;
  const step = Math.max(50, Math.ceil(qty / 50) * 50);
  if (step >= 1000) return `${dec(Math.ceil(qty / 100) / 10)} ${unit === 'мл' ? 'л' : 'кг'}`;
  return `${step} ${unit}`;
}

export const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

export function listTotals(rows: Array<{ est: number | null; real: number | null; bought: boolean }>) {
  let bought = 0; let left = 0; let unpriced = 0; let doneCount = 0;
  for (const r of rows) {
    if (r.bought) { doneCount += 1; bought += r.real ?? r.est ?? 0; } else if (r.est === null) unpriced += 1; else left += r.est;
  }
  return { count: rows.length, doneCount, bought: Math.round(bought), left: Math.round(left), unpriced };
}
```

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test -- src/features/shop tests/shop-parity.test.ts`
Expected: PASS: build (8), parity (6).

```bash
git add app && git commit -m "feat: build the shopping list from the menu with soup pots and family portions" && git push origin main
```

---

### Task 3: Новые таблицы в телефоне и в синхронизации

**Files:**
- Modify: `app/src/data/db.ts`, `app/src/data/sync.ts`, `app/src/data/SyncProvider.tsx`, `app/src/app/App.tsx`
- Create: `app/src/data/db-upgrade.test.ts`
- Modify: `app/src/data/SyncProvider.test.tsx`

**Interfaces:**
- Consumes: всё из задач 3–6 плана 2.
- Produces:
  - типы `DishOffer`, `ShoppingItem`, `ShoppingMark`, `ShopTrip`, `NotEat`;
  - в `SyncTable` и `KEY_FIELDS` добавлены `dish_offers` (`id`), `shopping_items` (`id`), `shopping_marks` (`item_id`), `shop_trips` (`id`), `not_eat` (`household_id`, `kind`, `ref`);
  - Dexie версии 2;
  - `V1_STORES` — схема версии 1, экспортируется для теста;
  - у `SyncProvider` новый проп `portions: number`, он пишется в `meta('family_portions')`;
  - Realtime слушает новые таблицы.

- [ ] **Step 1: Падающие тесты**

`app/src/data/db-upgrade.test.ts`:

```ts
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS, slotKey, V1_STORES } from './db';

describe('local db version 2', () => {
  it('keeps weeks stored by version 1 and adds the shopping tables', async () => {
    const name = `t-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores(V1_STORES);
    await old.open();
    await old.table('weeks').put({ id: 'w1', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: null, updated_at: 'x', deleted_at: null });
    old.close();
    const db = createLocalDb(name);
    expect(await db.weeks.count()).toBe(1);
    expect(await db.shopping_marks.count()).toBe(0);
    await db.not_eat.put({ household_id: 'h1', kind: 'item', ref: 'грибы', updated_at: 'x', deleted_at: null });
    expect(await db.not_eat.get(['h1', 'item', 'грибы'])).toBeTruthy();
  });

  it('knows the keys of the new tables', () => {
    expect(KEY_FIELDS.shopping_marks).toEqual(['item_id']);
    expect(slotKey('not_eat', { household_id: 'h', kind: 'item', ref: 'грибы' })).toBe('h|item|грибы');
  });
});
```

В `app/src/data/SyncProvider.test.tsx` добавить тест:

```tsx
it('remembers the family portions and listens to shopping changes', async () => {
  const db = createLocalDb(`t-${Math.random()}`);
  const fake = fakeSupabase({}, KEY_FIELDS);
  const tables: string[] = [];
  const channel = { on(_e: unknown, f: { table: string }) { tables.push(f.table); return this; }, subscribe() { return this; } };
  const client = Object.assign(fake.client as object, { channel: () => channel, removeChannel() {} });
  render(<SyncProvider householdId="h1" portions={3.5} client={client as never} db={db}><Probe /></SyncProvider>);
  await waitFor(async () => expect((await db.meta.get('family_portions'))?.value).toBe(3.5));
  expect(tables).toEqual(expect.arrayContaining(['shopping_items', 'shopping_marks', 'dish_offers', 'shop_trips', 'not_eat']));
});
```

В существующем тесте этого файла проп `portions={3.5}` добавить в `<SyncProvider …>`.

Run: `npm test -- src/data`
Expected: FAIL — нет `V1_STORES`, нет таблиц.

- [ ] **Step 2: Реализация**

В `app/src/data/db.ts`:
- добавить типы;
- расширить `SyncTable` и `KEY_FIELDS`;
- вынести схему версии 1 в `V1_STORES`;
- объявить версию 2.

```ts
export type DishOffer = { id: string; household_id: string; from_member: string; to_member: string | null; dish_id: string; on_date: string; meal: Meal; how: 'over' | 'instead'; status: 'open' | 'taken' | 'declined'; taken_by: string | null; updated_at: string; deleted_at: string | null };
export type ShoppingItem = { id: string; household_id: string; week_id: string | null; offer_id: string | null; source: 'menu' | 'manual' | 'offer'; item: string | null; title: string; qty: number | null; unit: string | null; qty_text: string; dept: string; urgent: boolean; est_price: number | null; added_by: string | null; updated_at: string; deleted_at: string | null };
export type ShoppingMark = { item_id: string; household_id: string; bought: boolean; by_member: string | null; price_real: number | null; updated_at: string };
export type ShopTrip = { id: string; household_id: string; member_id: string; started_at: string; updated_at: string };
export type NotEat = { household_id: string; kind: 'item' | 'dish'; ref: string; updated_at: string; deleted_at: string | null };

export type SyncTable = 'weeks' | 'week_slots' | 'votes' | 'week_templates' | 'template_slots'
  | 'dish_offers' | 'shopping_items' | 'shopping_marks' | 'shop_trips' | 'not_eat';

export const KEY_FIELDS: Record<SyncTable, string[]> = {
  weeks: ['id'],
  week_slots: ['week_id', 'day', 'meal'],
  votes: ['week_id', 'member_id'],
  week_templates: ['id'],
  template_slots: ['template_id', 'day', 'meal'],
  dish_offers: ['id'],
  shopping_items: ['id'],
  shopping_marks: ['item_id'],
  shop_trips: ['id'],
  not_eat: ['household_id', 'kind', 'ref'],
};

export const V1_STORES = {
  recipes: 'id, category, household_id',
  recipe_ingredients: '[recipe_id+pos], recipe_id',
  recipe_sides: '[recipe_id+side_id], recipe_id',
  ingredients: 'item',
  prices: 'item',
  week_templates: 'id, household_id',
  template_slots: '[template_id+day+meal], template_id',
  weeks: 'id, [household_id+starts_on], household_id',
  week_slots: '[week_id+day+meal], week_id, household_id',
  votes: '[week_id+member_id], week_id',
  outbox: '++seq, table',
  meta: 'key',
};
```

В классе `LocalDb` объявить таблицы:

```ts
  dish_offers!: Table<DishOffer, string>;
  shopping_items!: Table<ShoppingItem, string>;
  shopping_marks!: Table<ShoppingMark, string>;
  shop_trips!: Table<ShopTrip, string>;
  not_eat!: Table<NotEat, [string, string, string]>;
```

В конструкторе:

```ts
    this.version(1).stores(V1_STORES);
    this.version(2).stores({
      dish_offers: 'id, household_id, on_date',
      shopping_items: 'id, household_id, week_id',
      shopping_marks: 'item_id',
      shop_trips: 'id, household_id',
      not_eat: '[household_id+kind+ref], household_id',
    });
```

В `app/src/data/sync.ts`:

```ts
const TABLES: SyncTable[] = ['week_templates', 'template_slots', 'weeks', 'week_slots', 'votes', 'dish_offers', 'shopping_items', 'shopping_marks', 'shop_trips', 'not_eat'];
```

В `app/src/data/SyncProvider.tsx`:
- проп `portions: number`;
- эффект `useEffect(() => { db.meta.put({ key: 'family_portions', value: portions }); }, [db, portions]);`;
- список таблиц Realtime: `['weeks', 'week_slots', 'votes', 'dish_offers', 'shopping_items', 'shopping_marks', 'shop_trips', 'not_eat']`.

В `App.tsx` передать доли семьи:

```tsx
<SyncProvider householdId={me.household_id} portions={fam.members.reduce((s, m) => s + m.portion, 0) || 3.5}>
```

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор.

```bash
git add app/src && git commit -m "feat: sync shopping, offers, trips and not-eat tables to the phone" && git push origin main
```

---

### Task 4: Список покупок следует за меню

**Files:**
- Create: `app/src/features/shop/menuList.ts`, `app/src/features/shop/menuList.test.ts`
- Modify: `app/src/features/menu/testData.ts` (продукты, цены, состав блюд)
- Modify: `app/src/features/menu/actions.ts`, `app/src/features/menu/weekActions.ts` (после записи — пересчёт)
- Modify: `app/src/features/menu/actions.test.ts`, `app/src/features/menu/weekActions.test.ts` (считают в очереди только записи недели)

**Interfaces:**
- Consumes: `buildMenuList`, `formatQty` (задача 2); `writeLocal` (план 2, задача 4); таблицы задачи 3.
- Produces:
  - `regenerateWeekList(db: LocalDb, weekId: string): Promise<'done' | 'skipped'>` — сам решает, утверждена ли неделя;
  - `menuItemId(weekId, item)` → `m:<weekId>:<item>`;
  - `capitalize(s)`;
  - в `testData.ts`: `INGREDIENTS`, `PRICES`, `RECIPE_INGREDIENTS`; `seedMenu` кладёт и их.

- [ ] **Step 1: Данные для тестов**

В `app/src/features/menu/testData.ts`:

```ts
import type { Ingredient, Price, RecipeIngredient } from '../../data/db';

const ing = (item: string, unit: string, dept: string, pantry = false): Ingredient => ({ item, unit, dept, grp: 'x', piece_weight: null, piece_name: null, pantry });
export const INGREDIENTS: Ingredient[] = [
  ing('творог', 'г', 'Молочное и яйца'), ing('яйца', 'шт', 'Молочное и яйца'), ing('мука', 'г', 'Бакалея', true),
  ing('овсяные хлопья', 'г', 'Бакалея'), ing('свёкла', 'г', 'Овощи и фрукты'), ing('капуста', 'г', 'Овощи и фрукты'),
  ing('картофель', 'г', 'Овощи и фрукты'), ing('минтай', 'г', 'Рыба'), ing('яблоки', 'г', 'Овощи и фрукты'),
  ing('фарш', 'г', 'Мясо и птица'), ing('рис', 'г', 'Бакалея'), ing('гречка', 'г', 'Бакалея'),
];
const price = (item: string, p: number): Price => ({ item, price_per_unit: p, source: 'тест', note: null, collected: '2026-10-13' });
export const PRICES: Price[] = [
  price('творог', 0.6), price('яйца', 12), price('овсяные хлопья', 0.1), price('свёкла', 0.04), price('капуста', 0.03),
  price('картофель', 0.035), price('минтай', 0.4), price('фарш', 0.5), price('рис', 0.12), price('гречка', 0.1),
];
const ri = (recipe_id: string, rows: Array<[string, number | null]>): RecipeIngredient[] =>
  rows.map(([item, qty], pos) => ({ recipe_id, pos, item, qty, to_taste: qty === null, note: '', optional: false }));
export const RECIPE_INGREDIENTS: RecipeIngredient[] = [
  ...ri('br-syrniki', [['творог', 500], ['яйца', 1], ['мука', 60]]),
  ...ri('br-kasha', [['овсяные хлопья', 200]]),
  ...ri('sp-borsch', [['свёкла', 400], ['капуста', 300], ['картофель', 400]]),
  ...ri('sp-ukha', [['минтай', 500], ['картофель', 300]]),
  ...ri('sn-yabloki', [['яблоки', 600]]),
  ...ri('mn-kotlety', [['фарш', 600], ['яйца', 1]]),
  ...ri('mn-plov', [['рис', 300], ['фарш', 400]]),
  ...ri('side-grechka', [['гречка', 250]]),
];
```

У `sp-borsch` поставить `servings: 8`, у `sp-ukha` — `servings: 6`: функция `recipe` принимает `extra`. Подборки для задачи 6: `br-syrniki` — `collections: ['weekend']`, `sn-yabloki` — `collections: ['sweet']`.

В начало `seedMenu` добавить:

```ts
  await db.ingredients.bulkPut(INGREDIENTS);
  await db.prices.bulkPut(PRICES);
  await db.recipe_ingredients.bulkPut(RECIPE_INGREDIENTS);
```

- [ ] **Step 2: Падающие тесты**

`app/src/features/shop/menuList.test.ts`:

```ts
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
```

Как получены ожидаемые числа (доля 3,5 на рецепт на 4 порции даёт 0,875):
- творог: 500 × 0,875 × 4 завтрака = 1750 г → «1,8 кг»;
- яйца: сырники 0,875 × 4 + котлеты 0,875 × 7 = 9,625 → «10 шт»;
- фарш: 600 × 0,875 × 7 = 3675 г, × 0,5 ₽ = 1837,5 → 1838.

После замены вторничного ужина на плов:
- фарш куплен, поэтому строка не меняется;
- рис: 300 × 0,875 = 262,5 → «300 г»;
- яйца: 9,625 − 0,875 = 8,75 → «9 шт».

Run: `npm test -- src/features/shop/menuList.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`app/src/features/shop/menuList.ts`:

```ts
import { writeLocal } from '../../data/sync';
import type { LocalDb, ShoppingItem } from '../../data/db';
import { buildMenuList, formatQty } from './build';

export const menuItemId = (weekId: string, item: string) => `m:${weekId}:${item}`;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const SAME: Array<keyof ShoppingItem> = ['title', 'qty', 'unit', 'qty_text', 'dept', 'est_price', 'deleted_at'];

// Rebuilds the menu part of an approved week's list. Bought lines stay as they are;
// if any dish of the week is missing on this phone, nothing is written.
export async function regenerateWeekList(db: LocalDb, weekId: string): Promise<'done' | 'skipped'> {
  const week = await db.weeks.get(weekId);
  if (!week || week.status !== 'approved' || week.deleted_at) return 'skipped';
  const slots = await db.week_slots.where('week_id').equals(weekId).toArray();
  const ids = [...new Set(slots.flatMap((s) => [s.dish_id, s.side_id, s.salad_id]).filter((x): x is string => !!x))];
  const recipes = await db.recipes.bulkGet(ids);
  if (recipes.some((r) => !r)) return 'skipped';
  const rows = await db.recipe_ingredients.where('recipe_id').anyOf(ids).toArray();
  const ingredientsOf = new Map<string, Array<{ item: string; qty: number | null }>>();
  for (const r of rows) ingredientsOf.set(r.recipe_id, [...(ingredientsOf.get(r.recipe_id) ?? []), { item: r.item, qty: r.qty === null ? null : Number(r.qty) }]);
  const lines = buildMenuList({
    slots,
    servings: new Map(recipes.map((r) => [r!.id, r!.servings])),
    ingredientsOf,
    vocab: new Map((await db.ingredients.toArray()).map((v) => [v.item, v])),
    prices: new Map((await db.prices.toArray()).map((p) => [p.item, Number(p.price_per_unit)])),
    portions: Number((await db.meta.get('family_portions'))?.value ?? 3.5),
  });

  const existing = new Map((await db.shopping_items.where('week_id').equals(weekId).toArray()).filter((i) => i.source === 'menu').map((i) => [i.id, i]));
  const marks = await db.shopping_marks.bulkGet([...existing.keys()]);
  const bought = new Set(marks.filter((m) => m?.bought).map((m) => m!.item_id));
  const out: ShoppingItem[] = [];
  const wanted = new Set<string>();
  for (const l of lines) {
    const id = menuItemId(weekId, l.item);
    wanted.add(id);
    if (bought.has(id)) continue;
    const next: ShoppingItem = {
      id, household_id: week.household_id, week_id: weekId, offer_id: null, source: 'menu', item: l.item, title: capitalize(l.item),
      qty: round1(l.qty), unit: l.unit, qty_text: formatQty(l.qty, l.unit), dept: l.dept, urgent: false,
      est_price: l.est === null ? null : Math.round(l.est), added_by: null, updated_at: '', deleted_at: null,
    };
    const prev = existing.get(id);
    if (!prev || SAME.some((k) => prev[k] !== next[k])) out.push(next);
  }
  const now = new Date().toISOString();
  for (const [id, prev] of existing) if (!wanted.has(id) && !bought.has(id) && !prev.deleted_at) out.push({ ...prev, deleted_at: now });
  if (out.length) await writeLocal(db, 'shopping_items', out);
  return 'done';
}
```

В `actions.ts` в конце `replaceMeal` и `replaceDay`:

```ts
  await regenerateWeekList(db, week.id);
```

В `weekActions.ts`:
- в конце `setWeekFromTemplate`, перед `return week`, добавить `await regenerateWeekList(db, week.id);`;
- в конце `approveWeek` добавить `await regenerateWeekList(db, week.id);`.

Импорт: `import { regenerateWeekList } from '../shop/menuList';`.

Пересчёт добавляет в очередь строки списка. Поэтому тесты плана 2, которые считают очередь, переходят на подсчёт записей недели:
- `actions.test.ts`: `expect(await db.outbox.where('table').equals('week_slots').count()).toBe(1)` и `.toBe(4)`;
- `weekActions.test.ts`: `expect(await db.outbox.where('table').anyOf(['weeks', 'week_slots']).count()).toBe(29)`.

- [ ] **Step 4: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, в том числе menuList (5).

```bash
git add app/src && git commit -m "feat: keep the shopping list in step with the approved menu" && git push origin main
```

---

### Task 5: Экран «Покупки»

**Files:**
- Create: `app/src/features/shop/useShop.ts`, `shopActions.ts`, `listText.ts`, `ShopPage.tsx`, `AddItemSheet.tsx`, `ItemSheet.tsx`, `ShopPage.test.tsx`, `listText.test.ts`
- Modify: `app/src/features/shell/Icon.tsx` (иконки `bag`, `copy`, `search`)
- Modify: `app/src/styles/components.css` (кнопка цены, баннер похода)
- Modify: `app/src/app/App.tsx` (маршрут `/shop`)

**Interfaces:**
- Consumes: таблицы задачи 3; `listTotals`, `rub`, `deptRank` (задача 2); `writeLocal`; `Sheet` (план 2, задача 8); `mondayOf`, `addDaysIso`, `weekLabel`.
- Produces:
  - `useShop(db, householdId, today)` → `{ weeks: Week[]; items: ShoppingItem[]; marks: Map<string, ShoppingMark>; lastTrip: ShopTrip | null } | undefined`;
  - `visibleItems(items, weekId)` и `groupByDept(items, marks)` — для Главной;
  - `setBought(db, item, me, bought, prev?)`, `setRealPrice(db, item, me, price, prev?)`, `addManualItem(db, me, { title, qtyText, urgent, vocab })`, `removeItem(db, item)`, `goShopping(db, me, at?)`;
  - `listText(title, rows)`;
  - `ShopPage({ me, members, db?, today?, clipboard? })`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/shop/listText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { listText } from './listText';

describe('listText', () => {
  it('lists what is left to buy by department', () => {
    expect(listText('Покупки на 12–18 октября', [
      { title: 'Молоко', qty_text: '2 л', dept: 'Молочное и яйца', urgent: true },
      { title: 'Картофель', qty_text: '3 кг', dept: 'Овощи и фрукты', urgent: false },
      { title: 'Батарейки', qty_text: '', dept: 'Другое', urgent: false },
    ])).toBe([
      'Покупки на 12–18 октября', '',
      'Овощи и фрукты', '— Картофель, 3 кг', '',
      'Молочное и яйца', '— Молоко, 2 л (срочно)', '',
      'Другое', '— Батарейки',
    ].join('\n'));
  });
});
```

`app/src/features/shop/ShopPage.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { regenerateWeekList, menuItemId } from './menuList';
import ShopPage from './ShopPage';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 18, 30);

async function ready() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  await regenerateWeekList(db, 'w-cur');
  return db;
}
const show = (db: ReturnType<typeof createLocalDb>, extra: Partial<Parameters<typeof ShopPage>[0]> = {}) =>
  render(<MemoryRouter><ShopPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} {...extra} /></MemoryRouter>);

describe('ShopPage', () => {
  it('shows the week list by department and marks a purchase for everyone', async () => {
    const db = await ready();
    show(db);
    const dairy = (await screen.findByRole('heading', { name: 'Молочное и яйца' })).closest('section')!;
    await userEvent.click(within(dairy).getByRole('button', { name: /Творог, 1,8 кг/ }));
    await waitFor(async () => expect((await db.shopping_marks.get(menuItemId('w-cur', 'творог')))?.bought).toBe(true));
    expect(screen.getByText('Отмечено 1 из 9')).toBeInTheDocument();
    expect(await db.outbox.where('table').equals('shopping_marks').count()).toBe(1);
  });

  it('sums what is bought and what is left, naming lines without a price', async () => {
    const db = await ready();
    show(db);
    expect(await screen.findByText(/Осталось ≈/)).toHaveTextContent(/без 1 продукта/);
  });

  it('adds an urgent item by hand', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(screen.getByLabelText('Что купить'), 'Молоко');
    await userEvent.type(screen.getByLabelText('Сколько'), '2 л');
    await userEvent.click(screen.getByRole('switch', { name: 'Срочно' }));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить в список' }));
    expect(await screen.findByRole('button', { name: /Молоко, 2 л/ })).toHaveTextContent('срочно');
  });

  it('copies what is left as text', async () => {
    const db = await ready();
    await db.shopping_marks.put({ item_id: menuItemId('w-cur', 'гречка'), household_id: 'h1', bought: true, by_member: 'm-papa', price_real: null, updated_at: 'x' });
    const writeText = vi.fn(() => Promise.resolve());
    show(db, { clipboard: { writeText } });
    await userEvent.click(await screen.findByRole('button', { name: 'Скопировать' }));
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('— Творог, 1,8 кг');
    expect(text).not.toContain('Гречка');
    expect(await screen.findByText('Список скопирован')).toBeInTheDocument();
  });

  it('tells the family who went to the shop', async () => {
    const db = await ready();
    await db.shop_trips.put({ id: 't1', household_id: 'h1', member_id: 'm-mama', started_at: new Date(2026, 9, 13, 18, 10).toISOString(), updated_at: 'x' });
    show(db);
    expect(await screen.findByText('Мама в магазине с 18:10')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Иду в магазин' }));
    await waitFor(async () => expect(await db.shop_trips.count()).toBe(2));
    expect(await screen.findByRole('button', { name: 'Вы в магазине' })).toBeDisabled();
  });

  it('explains where the list comes from when it is empty', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    show(db);
    expect(await screen.findByText(/Список соберётся сам, когда родитель утвердит неделю/)).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/features/shop`
Expected: FAIL — модулей нет.

- [ ] **Step 2: Данные и действия**

`app/src/features/shop/useShop.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import { addDaysIso, mondayOf } from '../menu/week';
import { deptRank } from './build';

export function useShop(db: LocalDb, householdId: string, today: Date) {
  const start = mondayOf(today);
  const next = addDaysIso(start, 7);
  return useLiveQuery(async () => {
    const weeks = (await db.weeks.where('household_id').equals(householdId).toArray())
      .filter((w) => !w.deleted_at && w.status === 'approved' && (w.starts_on === start || w.starts_on === next))
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    const items = (await db.shopping_items.where('household_id').equals(householdId).toArray()).filter((i) => !i.deleted_at);
    const marks = new Map((await db.shopping_marks.bulkGet(items.map((i) => i.id))).filter((m): m is ShoppingMark => !!m).map((m) => [m.item_id, m]));
    const trips = (await db.shop_trips.where('household_id').equals(householdId).toArray()).sort((a, b) => b.started_at.localeCompare(a.started_at));
    return { weeks, items, marks, lastTrip: trips[0] ?? null };
  }, [db, householdId, start]);
}

// Menu lines belong to one week; hand-added and offered lines show with any week.
export const visibleItems = (items: ShoppingItem[], weekId: string | null) => items.filter((i) => i.source !== 'menu' || i.week_id === weekId);

export function groupByDept(items: ShoppingItem[], marks: Map<string, ShoppingMark>) {
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of items) groups.set(i.dept, [...(groups.get(i.dept) ?? []), i]);
  const done = (i: ShoppingItem) => Number(!!marks.get(i.id)?.bought);
  return [...groups.entries()]
    .sort(([a], [b]) => deptRank(a) - deptRank(b))
    .map(([dept, list]) => ({ dept, items: list.sort((a, b) => done(a) - done(b) || Number(b.urgent) - Number(a.urgent) || a.title.localeCompare(b.title, 'ru')) }));
}
```

`app/src/features/shop/shopActions.ts`:

```ts
import { writeLocal } from '../../data/sync';
import type { Ingredient, LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import { capitalize } from './menuList';

export async function setBought(db: LocalDb, item: ShoppingItem, me: Member, bought: boolean, prev?: ShoppingMark) {
  await writeLocal(db, 'shopping_marks', [{ item_id: item.id, household_id: item.household_id, bought, by_member: me.id, price_real: prev?.price_real ?? null }]);
}

export async function setRealPrice(db: LocalDb, item: ShoppingItem, me: Member, price: number | null, prev?: ShoppingMark) {
  await writeLocal(db, 'shopping_marks', [{ item_id: item.id, household_id: item.household_id, bought: prev?.bought ?? true, by_member: prev?.by_member ?? me.id, price_real: price }]);
}

export async function addManualItem(db: LocalDb, me: Member, a: { title: string; qtyText: string; urgent: boolean; vocab: Map<string, Ingredient> }) {
  const title = a.title.trim();
  const v = a.vocab.get(title.toLowerCase());
  await writeLocal(db, 'shopping_items', [{
    id: `u:${crypto.randomUUID()}`, household_id: me.household_id, week_id: null, offer_id: null, source: 'manual',
    item: v ? v.item : null, title: capitalize(title), qty: null, unit: null, qty_text: a.qtyText.trim(), dept: v?.dept ?? 'Другое',
    urgent: a.urgent, est_price: null, added_by: me.id, deleted_at: null,
  }]);
}

export async function removeItem(db: LocalDb, item: ShoppingItem) {
  await writeLocal(db, 'shopping_items', [{ ...item, deleted_at: new Date().toISOString() }]);
}

export async function goShopping(db: LocalDb, me: Member, at = new Date()) {
  await writeLocal(db, 'shop_trips', [{ id: crypto.randomUUID(), household_id: me.household_id, member_id: me.id, started_at: at.toISOString() }]);
}
```

`app/src/features/shop/listText.ts`:

```ts
import { deptRank } from './build';

export function listText(title: string, rows: Array<{ title: string; qty_text: string; dept: string; urgent: boolean }>): string {
  const depts = [...new Set(rows.map((r) => r.dept))].sort((a, b) => deptRank(a) - deptRank(b));
  const blocks = depts.map((d) => [d, ...rows.filter((r) => r.dept === d).map((r) => `— ${r.title}${r.qty_text ? `, ${r.qty_text}` : ''}${r.urgent ? ' (срочно)' : ''}`)].join('\n'));
  return [title, '', blocks.join('\n\n')].join('\n');
}
```

- [ ] **Step 3: Экран и окна**

В `Icon.tsx` добавить символы из `mockups/index.html`:

```ts
  bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
```

`app/src/features/shop/AddItemSheet.tsx`:

```tsx
import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { Ingredient } from '../../data/db';

export default function AddItemSheet({ vocab, onAdd, onClose }: { vocab: Map<string, Ingredient>; onAdd: (a: { title: string; qtyText: string; urgent: boolean }) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [qtyText, setQty] = useState('');
  const [urgent, setUrgent] = useState(false);
  const add = async () => { await onAdd({ title, qtyText, urgent }); onClose(); };
  return (
    <Sheet title="Добавить в список" sub="Увидит вся семья. Срочное покажется на Главной." onClose={onClose}
      actions={<button type="button" className="btn" disabled={!title.trim()} onClick={add}>Добавить в список</button>}>
      <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
        <label className="field">Что купить<input value={title} onChange={(e) => setTitle(e.target.value)} list="vocab" maxLength={80} autoComplete="off" /></label>
        <datalist id="vocab">{[...vocab.keys()].map((v) => <option key={v} value={v} />)}</datalist>
        <label className="field">Сколько<input value={qtyText} onChange={(e) => setQty(e.target.value)} maxLength={40} placeholder="Например, 2 л" /></label>
        <div className="row"><span className="row-main"><b>Срочно</b><small>нужно сегодня</small></span>
          <button type="button" className="switch" role="switch" aria-checked={urgent} aria-label="Срочно" onClick={() => setUrgent(!urgent)}><i /></button></div>
      </div>
    </Sheet>
  );
}
```

`app/src/features/shop/ItemSheet.tsx`:

```tsx
import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { ShoppingItem, ShoppingMark } from '../../data/db';
import { rub } from './build';

export default function ItemSheet({ item, mark, onPrice, onRemove, onClose }: {
  item: ShoppingItem; mark?: ShoppingMark; onPrice: (p: number | null) => Promise<void>; onRemove: () => Promise<void>; onClose: () => void;
}) {
  const [price, setPrice] = useState(mark?.price_real?.toString() ?? '');
  const save = async () => { const n = Number(price.replace(',', '.')); await onPrice(price.trim() && Number.isFinite(n) ? n : null); onClose(); };
  return (
    <Sheet title={item.title} sub={[item.qty_text, item.est_price !== null ? `примерно ${rub(item.est_price)}` : ''].filter(Boolean).join(' · ')} onClose={onClose}
      actions={<button type="button" className="btn" onClick={save}>Сохранить</button>}>
      <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
        <label className="field">Сколько заплатили, ₽<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Например, 189" /></label>
        {item.source === 'manual' ? <button type="button" className="btn soft" onClick={async () => { await onRemove(); onClose(); }}>Убрать из списка</button> : null}
      </div>
    </Sheet>
  );
}
```

`app/src/features/shop/ShopPage.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import { localDb, type LocalDb, type ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import { weekLabel } from '../menu/week';
import { listTotals, rub } from './build';
import { groupByDept, useShop, visibleItems } from './useShop';
import { addManualItem, goShopping, removeItem, setBought, setRealPrice } from './shopActions';
import { listText } from './listText';
import AddItemSheet from './AddItemSheet';
import ItemSheet from './ItemSheet';

const TRIP_MS = 3 * 3600 * 1000;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const products = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'продукта' : 'продуктов');
type Clip = { writeText: (t: string) => Promise<void> };

export default function ShopPage({ me, members, db = localDb, today = new Date(), clipboard }: { me: Member; members: Member[]; db?: LocalDb; today?: Date; clipboard?: Clip }) {
  const data = useShop(db, me.household_id, today);
  const vocab = useLiveQuery(async () => new Map((await db.ingredients.toArray()).map((v) => [v.item, v])), [db]);
  const [weekPick, setWeekPick] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'add' | ShoppingItem | null>(null);
  const [note, setNote] = useState('');
  const weekId = weekPick ?? data?.weeks[0]?.id ?? null;
  const shown = useMemo(() => (data ? visibleItems(data.items, weekId) : []), [data, weekId]);
  if (!data) return <><Header title="Покупки" /><p className="note" style={{ margin: 16 }}>Загружаем список…</p></>;

  const { marks, lastTrip } = data;
  const totals = listTotals(shown.map((i) => ({ est: i.est_price, real: marks.get(i.id)?.price_real ?? null, bought: !!marks.get(i.id)?.bought })));
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const tripFresh = lastTrip && today.getTime() - new Date(lastTrip.started_at).getTime() < TRIP_MS;
  const meShopping = tripFresh && lastTrip!.member_id === me.id;
  const week = data.weeks.find((w) => w.id === weekId);
  const origin = (i: ShoppingItem) => (i.source === 'menu' ? 'из меню' : i.source === 'offer' ? 'к предложенному блюду' : `вручную · ${name(i.added_by)}`);

  const copy = async () => {
    const text = listText(week ? `Покупки на ${weekLabel(week.starts_on)}` : 'Покупки', shown.filter((i) => !marks.get(i.id)?.bought));
    const clip = clipboard ?? navigator.clipboard;
    try { await clip.writeText(text); setNote('Список скопирован'); } catch { setNote('Не получилось скопировать. Выделите список вручную.'); }
  };

  return (
    <>
      <Header title="Покупки" subtitle={`Отмечено ${totals.doneCount} из ${totals.count}`}
        action={<button type="button" className="head-pill" onClick={() => setSheet('add')}><Icon name="plus" />Добавить</button>} />
      {tripFresh && !meShopping ? (
        <section className="notice" aria-live="polite"><span className="row-main"><b>{name(lastTrip!.member_id)} в магазине с {hhmm(lastTrip!.started_at)}</b><small>Добавьте, что нужно купить.</small></span></section>
      ) : null}
      {data.weeks.length > 1 ? (
        <div className="segs" role="tablist" aria-label="Неделя">
          {data.weeks.map((w) => <button key={w.id} type="button" role="tab" aria-selected={w.id === weekId} onClick={() => setWeekPick(w.id)}>{weekLabel(w.starts_on)}</button>)}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <section className="card"><p className="note" style={{ margin: 0 }}>Список соберётся сам, когда родитель утвердит неделю в Меню. Срочное можно добавить вручную.</p></section>
      ) : (
        <>
          <div className="bento"><div className="tile wide" style={{ ['--h' as string]: 'var(--k-shop)', cursor: 'default' }}>
            <span className="t-k"><Icon name="cart" />Куплено на {rub(totals.bought)}</span>
            <span className="t-v">Осталось ≈&nbsp;{rub(totals.left)}{totals.unpriced ? ` без ${totals.unpriced} ${products(totals.unpriced)}` : ''}</span>
            <span className="bar" aria-hidden="true"><i style={{ width: `${totals.bought + totals.left ? (totals.bought / (totals.bought + totals.left)) * 100 : 0}%` }} /></span>
          </div></div>
          <div className="btns fill" style={{ margin: '0 16px 14px' }}>
            <button type="button" className="btn" disabled={!!meShopping} onClick={() => goShopping(db, me, today)}><Icon name="bag" />{meShopping ? 'Вы в магазине' : 'Иду в магазин'}</button>
            <button type="button" className="btn soft" onClick={copy}><Icon name="copy" />Скопировать</button>
          </div>
          {note ? <p className="note" role="status" style={{ margin: '0 16px 12px' }}>{note}</p> : null}
          {groupByDept(shown, marks).map((g) => (
            <section className="card" key={g.dept} aria-labelledby={`dept-${g.dept}`}>
              <div className="card-h"><h2 id={`dept-${g.dept}`}>{g.dept}</h2><span className="note" style={{ margin: 0 }}>{g.items.filter((i) => marks.get(i.id)?.bought).length} из {g.items.length}</span></div>
              {g.items.map((i) => {
                const m = marks.get(i.id);
                const done = !!m?.bought;
                const price = m?.price_real ?? i.est_price;
                return (
                  <div className={`row ${done ? 'done' : ''}`} key={i.id}>
                    <button type="button" className="row-btn" aria-pressed={done} aria-label={`${i.title}${i.qty_text ? `, ${i.qty_text}` : ''}${i.urgent ? ', срочно' : ''}`} onClick={() => setBought(db, i, me, !done, m)}>
                      <span className="check" aria-hidden="true"><Icon name="check" /></span>
                      <span className="row-main"><b>{i.title}</b><small>{[i.qty_text, origin(i)].filter(Boolean).join(' · ')}</small></span>
                      {i.urgent ? <span className="pill">срочно</span> : null}
                    </button>
                    <button type="button" className="amount amount-btn" aria-label={`${i.title}: цена`} onClick={() => setSheet(i)}>{price !== null ? rub(price) : '—'}</button>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
      {sheet === 'add' && vocab ? <AddItemSheet vocab={vocab} onAdd={(a) => addManualItem(db, me, { ...a, vocab })} onClose={() => setSheet(null)} /> : null}
      {sheet && sheet !== 'add' ? (
        <ItemSheet item={sheet} mark={marks.get(sheet.id)} onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))} onRemove={() => removeItem(db, sheet)} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
```

`.head-pill`, `.notice`, `.segs`, `.bento`, `.tile`, `.row-btn`, `.check`, `.pill` и `.amount` уже есть в `components.css`. Кроме того, перенести из `mockups/styles.css` блок `.notice` (строка 312), если его ещё нет, и добавить:

```css
.amount-btn { flex: none; border: 0; background: none; padding: 8px 0 8px 10px; font: inherit; color: inherit; cursor: pointer; }
```

В `App.tsx` маршрут `/shop` → `<ShopPage me={me} members={fam.members} />`.

- [ ] **Step 4: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, в том числе ShopPage (6) и listText (1).

```bash
git add app/src && git commit -m "feat: add the shared shopping list with marks, manual items, copy and shop trips" && git push origin main
```

---

### Task 6: «Что покушать» и предложение блюда

**Files:**
- Create: `app/src/features/ideas/search.ts`, `search.test.ts`, `offerActions.ts`, `offerActions.test.ts`, `IdeasPanel.tsx`, `RecipeSheet.tsx`, `IdeasPanel.test.tsx`
- Modify: `app/src/features/menu/MenuPage.tsx` (вкладки «Неделя / Что покушать», `?panel=ideas`)
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: `Recipe`, `RecipeIngredient`, `DishOffer`, `NotEat` (задача 3); `buildMenuList`, `formatQty`, `rub` (задача 2); `capitalize` (задача 4); `writeLocal`; `Sheet`.
- Produces:
  - `recipeMatches(q, recipe, items)`, `blockedBy(recipe, items, notEat)`;
  - `offerDate(when: 'today' | 'tomorrow' | 'weekend', today)`;
  - `createOffer(db, a)`, `takeOffer(db, offer, me)`, `declineOffer(db, offer)`, `addOfferItems(db, offer)`;
  - `COLLECTIONS`, `MEAL_FOR`;
  - компоненты `IdeasPanel({ me, members, db, today })` и `RecipeSheet(...)`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/ideas/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { blockedBy, recipeMatches } from './search';
import { RECIPES } from '../menu/testData';

const syrniki = RECIPES.find((r) => r.id === 'br-syrniki')!;

describe('search', () => {
  it('finds a dish by name or by a product in it, ignoring ё and case', () => {
    expect(recipeMatches('сырн', syrniki, ['творог'])).toBe(true);
    expect(recipeMatches('ТВОРОГ', syrniki, ['творог'])).toBe(true);
    expect(recipeMatches('курица', syrniki, ['творог'])).toBe(false);
    expect(recipeMatches('', syrniki, [])).toBe(true);
  });
  it('blocks a dish with a product the family does not eat, by whole word', () => {
    const ne = (ref: string, kind: 'item' | 'dish' = 'item') => ({ household_id: 'h1', kind, ref, updated_at: 'x', deleted_at: null });
    expect(blockedBy(syrniki, ['творог', 'яйца'], [ne('творог')])).toBe('творог');
    expect(blockedBy(syrniki, ['печенье'], [ne('печень')])).toBeNull();
    expect(blockedBy(syrniki, ['курица целая'], [ne('курица')])).toBe('курица');
    expect(blockedBy(syrniki, [], [ne('br-syrniki', 'dish')])).toBe('Сырники');
  });
});
```

`app/src/features/ideas/offerActions.test.ts`:

```ts
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
```

`app/src/features/ideas/IdeasPanel.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import MenuPage from '../menu/MenuPage';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

async function open() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
  return db;
}

describe('Что покушать', () => {
  it('filters by collection and finds a dish by a product', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Сладкое' }));
    expect(screen.getByRole('button', { name: /Печёные яблоки/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Сырники/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Все' }));
    await userEvent.type(screen.getByRole('searchbox'), 'творог');
    expect(await screen.findByRole('button', { name: /^Сырники/ })).toBeInTheDocument();
  });

  it('shows a recipe for the family and offers it to a member', async () => {
    const db = await open();
    await userEvent.type(await screen.findByRole('searchbox'), 'сырники');
    await userEvent.click(await screen.findByRole('button', { name: /^Сырники/ }));
    const sheet = screen.getByRole('dialog', { name: 'Сырники' });
    expect(within(sheet).getByText('450 г')).toBeInTheDocument();
    expect(within(sheet).getByText('есть дома')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Мама' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Завтра' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Предложить' }));
    await waitFor(async () => expect((await db.dish_offers.toArray()).map((o) => [o.to_member, o.on_date, o.meal, o.status])).toEqual([['m-mama', '2026-10-14', 'breakfast', 'open']]));
  });

  it('puts an offer for me on top with «Сделаю»', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put({ id: 'o1', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'mn-plov', on_date: '2026-10-13', meal: 'dinner', how: 'instead', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Мама просит: Плов' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сделаю' }));
    await waitFor(async () => expect((await db.dish_offers.get('o1'))?.status).toBe('taken'));
  });

  it('hides dishes the family does not eat', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.not_eat.put({ household_id: 'h1', kind: 'item', ref: 'творог', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.type(await screen.findByRole('searchbox'), 'сырники');
    expect(await screen.findByText(/Ничего не нашли/)).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/features/ideas`
Expected: FAIL — модулей нет.

- [ ] **Step 2: Поиск и предложения**

`app/src/features/ideas/search.ts`:

```ts
import type { NotEat, Recipe } from '../../data/db';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

export function recipeMatches(q: string, r: Pick<Recipe, 'name' | 'about'>, items: string[]): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${r.name} ${r.about} ${items.join(' ')}`);
  return words.every((w) => hay.includes(w));
}

// A product matches as a whole word at the start: «курица» blocks «курица целая», «печень» does not block «печенье».
export function blockedBy(r: Pick<Recipe, 'id' | 'name'>, items: string[], notEat: NotEat[]): string | null {
  for (const x of notEat) {
    if (x.deleted_at) continue;
    if (x.kind === 'dish' && x.ref === r.id) return r.name;
    const ref = norm(x.ref);
    if (x.kind === 'item' && items.some((i) => norm(i) === ref || norm(i).startsWith(`${ref} `))) return x.ref;
  }
  return null;
}
```

`app/src/features/ideas/offerActions.ts`:

```ts
import { writeLocal } from '../../data/sync';
import type { DishOffer, LocalDb, ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import { addDaysIso, dayOfWeek, mondayOf, type Meal } from '../menu/week';
import { buildMenuList, formatQty } from '../shop/build';
import { capitalize } from '../shop/menuList';

export const MEAL_FOR: Record<Meal, string> = { breakfast: 'на завтрак', lunch: 'на обед', snack: 'на полдник', dinner: 'на ужин' };
export const COLLECTIONS = [
  { id: 'weekend', name: 'Выходной проект' }, { id: 'world', name: 'Кухни мира' }, { id: 'cafe', name: 'Как в кафе' },
  { id: 'quick-new', name: 'Быстро и необычно' }, { id: 'sweet', name: 'Сладкое' }, { id: 'kids-cook', name: 'Готовим с детьми' },
];

export function offerDate(when: 'today' | 'tomorrow' | 'weekend', today: Date): string {
  const t = addDaysIso(mondayOf(today), dayOfWeek(today));
  if (when === 'today') return t;
  if (when === 'tomorrow') return addDaysIso(t, 1);
  return dayOfWeek(today) >= 5 ? t : addDaysIso(mondayOf(today), 5);
}

export async function createOffer(db: LocalDb, a: { me: Member; to: string | null; dish: string; date: string; meal: Meal; how: 'over' | 'instead'; cookMyself?: boolean }): Promise<DishOffer> {
  const offer: DishOffer = {
    id: crypto.randomUUID(), household_id: a.me.household_id, from_member: a.me.id, to_member: a.cookMyself ? a.me.id : a.to,
    dish_id: a.dish, on_date: a.date, meal: a.meal, how: a.how, status: a.cookMyself ? 'taken' : 'open',
    taken_by: a.cookMyself ? a.me.id : null, updated_at: '', deleted_at: null,
  };
  await writeLocal(db, 'dish_offers', [offer]);
  if (a.cookMyself) await addOfferItems(db, offer);
  return offer;
}

export async function takeOffer(db: LocalDb, offer: DishOffer, me: Member) {
  await writeLocal(db, 'dish_offers', [{ ...offer, status: 'taken', taken_by: me.id }]);
  await addOfferItems(db, offer);
}

export async function declineOffer(db: LocalDb, offer: DishOffer) {
  await writeLocal(db, 'dish_offers', [{ ...offer, status: 'declined' }]);
}

export async function addOfferItems(db: LocalDb, offer: DishOffer) {
  const recipe = await db.recipes.get(offer.dish_id);
  if (!recipe) return;
  const rows = await db.recipe_ingredients.where('recipe_id').equals(recipe.id).toArray();
  const lines = buildMenuList({
    slots: [{ day: 0, meal: offer.meal, dish_id: recipe.id, side_id: null, salad_id: null, simple: null }],
    servings: new Map([[recipe.id, recipe.servings]]),
    ingredientsOf: new Map([[recipe.id, rows.map((r) => ({ item: r.item, qty: r.qty === null ? null : Number(r.qty) }))]]),
    vocab: new Map((await db.ingredients.toArray()).map((v) => [v.item, v])),
    prices: new Map((await db.prices.toArray()).map((p) => [p.item, Number(p.price_per_unit)])),
    portions: Number((await db.meta.get('family_portions'))?.value ?? 3.5),
  });
  const items: ShoppingItem[] = lines.map((l) => ({
    id: `o:${offer.id}:${l.item}`, household_id: offer.household_id, week_id: null, offer_id: offer.id, source: 'offer', item: l.item,
    title: capitalize(l.item), qty: l.qty === null ? null : Math.round(l.qty * 10) / 10, unit: l.unit, qty_text: formatQty(l.qty, l.unit),
    dept: l.dept, urgent: false, est_price: l.est === null ? null : Math.round(l.est), added_by: null, updated_at: '', deleted_at: null,
  }));
  if (items.length) await writeLocal(db, 'shopping_items', items);
}
```

Проверка чисел теста: плов на 4 порции, доля 0,875. Рис: 300 × 0,875 = 262,5 → «300 г». Фарш: 400 × 0,875 = 350 → «350 г».

- [ ] **Step 3: Панель и окно рецепта**

`app/src/features/ideas/RecipeSheet.tsx`:

```tsx
import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { Ingredient, Recipe, RecipeIngredient } from '../../data/db';
import type { Member } from '../family/useFamily';
import { MEAL_LABEL, type Meal } from '../menu/week';
import { formatQty, rub } from '../shop/build';

const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' } as const;
export type OfferDraft = { to: string | null; when: 'today' | 'tomorrow' | 'weekend'; meal: Meal; how: 'over' | 'instead' };
const defaultMeal = (r: Recipe): Meal => (r.category === 'breakfast' ? 'breakfast' : r.category === 'soup' ? 'lunch' : ['snack', 'dessert', 'drink'].includes(r.category) ? 'snack' : r.meals.includes('dinner') ? 'dinner' : (r.meals[0] as Meal) ?? 'dinner');

export default function RecipeSheet({ recipe, rows, vocab, prices, portions, me, members, onOffer, onClose }: {
  recipe: Recipe; rows: RecipeIngredient[]; vocab: Map<string, Ingredient>; prices: Map<string, number>; portions: number;
  me: Member; members: Member[]; onOffer: (d: OfferDraft, cookMyself: boolean) => Promise<void>; onClose: () => void;
}) {
  const [d, setD] = useState<OfferDraft>({ to: null, when: 'today', meal: defaultMeal(recipe), how: 'over' });
  const factor = portions / recipe.servings;
  let cost = 0; let missing = false;
  for (const r of rows) {
    if (r.qty === null || vocab.get(r.item)?.pantry) continue;
    const p = prices.get(r.item);
    if (p === undefined) missing = true; else cost += Number(r.qty) * factor * p;
  }
  const others = members.filter((m) => m.id !== me.id && m.user_id);
  const pick = <K extends keyof OfferDraft>(k: K, v: OfferDraft[K], label: string) => (
    <button type="button" className="pick" aria-pressed={d[k] === v} onClick={() => setD({ ...d, [k]: v })}>{label}</button>
  );
  const send = async (cook: boolean) => { await onOffer(d, cook); onClose(); };
  return (
    <Sheet title={recipe.name} sub={recipe.about} onClose={onClose}
      actions={<div className="btns fill"><button type="button" className="btn" onClick={() => send(false)}>Предложить</button><button type="button" className="btn soft" onClick={() => send(true)}>Приготовлю сам</button></div>}>
      <p className="meta-line"><span>{recipe.time_total} минут</span><span>{recipe.servings} {recipe.servings < 5 ? 'порции' : 'порций'}</span>{cost ? <span>≈&nbsp;{rub(cost)}{missing ? ' без части продуктов' : ''}</span> : null}</p>
      <p className="dima-line"><span><b>{DIMA[recipe.dima_level]}</b>{recipe.dima_note ? <small>{recipe.dima_note}</small> : null}</span></p>
      <h3 className="sh-h">Кому и когда</h3>
      <div className="offer-picks">
        <div className="pick-g"><span>Кому</span><div className="picks">{pick('to', null, 'Всем')}{others.map((m) => <span key={m.id}>{pick('to', m.id, m.name)}</span>)}</div></div>
        <div className="pick-g"><span>Когда</span><div className="picks">{pick('when', 'today', 'Сегодня')}{pick('when', 'tomorrow', 'Завтра')}{pick('when', 'weekend', 'В выходные')}</div></div>
        <div className="pick-g"><span>Приём</span><div className="picks">{(['breakfast', 'lunch', 'snack', 'dinner'] as Meal[]).map((m) => <span key={m}>{pick('meal', m, MEAL_LABEL[m])}</span>)}</div></div>
        <div className="pick-g"><span>Как</span><div className="picks">{pick('how', 'over', 'Поверх меню')}{pick('how', 'instead', 'Вместо блюда')}</div></div>
      </div>
      <h3 className="sh-h">Продукты на семью</h3>
      <ul className="ing">
        {rows.map((r) => {
          const v = vocab.get(r.item);
          const q = v?.pantry ? 'есть дома' : r.qty === null ? 'по вкусу' : formatQty(Number(r.qty) * factor, v?.unit ?? 'г');
          return <li key={r.pos}><span>{r.item.charAt(0).toUpperCase() + r.item.slice(1)}{r.note ? `, ${r.note}` : ''}</span><span>{q}</span></li>;
        })}
      </ul>
      <h3 className="sh-h">Как готовить</h3>
      <ol className="steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {recipe.source_url ? <p className="note" style={{ margin: '0 16px 16px' }}>Рецепт: <a href={recipe.source_url} target="_blank" rel="noreferrer">{recipe.source_site ?? 'источник'}</a></p> : null}
    </Sheet>
  );
}
```

`app/src/features/ideas/IdeasPanel.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Icon from '../shell/Icon';
import type { LocalDb, Recipe } from '../../data/db';
import type { Member } from '../family/useFamily';
import { addDaysIso, dayOfWeek, mondayOf } from '../menu/week';
import { blockedBy, recipeMatches } from './search';
import { COLLECTIONS, MEAL_FOR, createOffer, declineOffer, offerDate, takeOffer } from './offerActions';
import RecipeSheet from './RecipeSheet';

const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' } as const;

export default function IdeasPanel({ me, members, db, today }: { me: Member; members: Member[]; db: LocalDb; today: Date }) {
  const todayIso = addDaysIso(mondayOf(today), dayOfWeek(today));
  const data = useLiveQuery(async () => {
    const [recipes, rows, offers, notEat, vocab, prices, portions] = await Promise.all([
      db.recipes.filter((r) => !r.deleted_at && r.category !== 'side').toArray(),
      db.recipe_ingredients.toArray(),
      db.dish_offers.where('household_id').equals(me.household_id).toArray(),
      db.not_eat.where('household_id').equals(me.household_id).toArray(),
      db.ingredients.toArray(), db.prices.toArray(), db.meta.get('family_portions'),
    ]);
    const itemsOf = new Map<string, string[]>();
    for (const r of rows) itemsOf.set(r.recipe_id, [...(itemsOf.get(r.recipe_id) ?? []), r.item]);
    return {
      recipes, rows, itemsOf, notEat,
      offers: offers.filter((o) => !o.deleted_at && o.status === 'open' && o.from_member !== me.id && (o.to_member === me.id || o.to_member === null) && o.on_date >= todayIso).sort((a, b) => a.on_date.localeCompare(b.on_date)),
      vocab: new Map(vocab.map((v) => [v.item, v])), prices: new Map(prices.map((p) => [p.item, Number(p.price_per_unit)])),
      portions: Number(portions?.value ?? 3.5),
    };
  }, [db, me.household_id, me.id, todayIso]);
  const [col, setCol] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    if (!data) return [];
    const ok = (r: Recipe) => !blockedBy(r, data.itemsOf.get(r.id) ?? [], data.notEat);
    if (q.trim()) return data.recipes.filter((r) => ok(r) && recipeMatches(q, r, data.itemsOf.get(r.id) ?? [])).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return data.recipes.filter((r) => ok(r) && r.collections.length > 0 && (col === 'all' || r.collections.includes(col)));
  }, [data, q, col]);
  if (!data) return <p className="note" style={{ margin: 16 }}>Загружаем рецепты…</p>;

  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const dish = (id: string) => data.recipes.find((r) => r.id === id);
  const forMe = data.offers[0];
  const weekend = data.recipes.filter((r) => r.collections.includes('weekend'));
  const tip = weekend.length ? weekend[Math.floor(today.getTime() / (7 * 86400000)) % weekend.length] : undefined;
  const recipe = open ? data.recipes.find((r) => r.id === open) : undefined;

  return (
    <>
      {forMe && dish(forMe.dish_id) ? (
        <section className="hero" aria-label="Вам предложили блюдо">
          <h2>{name(forMe.from_member)} просит: {dish(forMe.dish_id)!.name}</h2>
          <p>{forMe.on_date === todayIso ? 'Сегодня' : forMe.on_date} {MEAL_FOR[forMe.meal]}, {forMe.how === 'over' ? 'поверх меню' : 'вместо блюда по меню'}. {dish(forMe.dish_id)!.time_total} минут.</p>
          <div className="hero-chips">
            <button type="button" className="hero-chip primary" onClick={() => takeOffer(db, forMe, me)}><Icon name="check" />Сделаю</button>
            <button type="button" className="hero-chip" onClick={() => setOpen(forMe.dish_id)}>Рецепт</button>
            <button type="button" className="hero-chip" onClick={() => declineOffer(db, forMe)}>Не {forMe.on_date === todayIso ? 'сегодня' : 'в этот день'}</button>
          </div>
        </section>
      ) : tip ? (
        <section className="hero" aria-label="Идея на выходные">
          <h2>На выходные: {tip.name.charAt(0).toLowerCase() + tip.name.slice(1)}</h2><p>{tip.about}. {tip.time_total} минут.</p>
          <div className="hero-chips"><button type="button" className="hero-chip primary" onClick={() => setOpen(tip.id)}>Посмотреть и предложить</button></div>
        </section>
      ) : null}
      <label className="search"><Icon name="search" /><span className="vh">Найти блюдо</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Блюдо или продукт: курица, яйца" autoComplete="off" /></label>
      {q.trim() ? null : (
        <div className="col-chips" role="group" aria-label="Подборки">
          {[{ id: 'all', name: 'Все' }, ...COLLECTIONS].map((c) => <button key={c.id} type="button" aria-pressed={col === c.id} onClick={() => setCol(c.id)}>{c.name}</button>)}
        </div>
      )}
      <div className="idea-grid">
        {list.map((r, i) => (
          <button key={r.id} type="button" className={`idea ${i === 0 && !q.trim() ? 'wide' : ''}`} onClick={() => setOpen(r.id)}>
            <b>{r.name}</b>{i === 0 && !q.trim() ? <span className="i-about">{r.about}</span> : null}
            <span className="i-meta"><span className="i-min">{r.time_total}<small>мин</small></span></span>
            <span className="i-dima">{DIMA[r.dima_level]}</span>
          </button>
        ))}
      </div>
      {list.length ? null : <p className="empty">Ничего не нашли. Попробуйте продукт: «курица», «творог», «яйца».</p>}
      {recipe ? (
        <RecipeSheet recipe={recipe} rows={data.rows.filter((r) => r.recipe_id === recipe.id).sort((a, b) => a.pos - b.pos)} vocab={data.vocab} prices={data.prices}
          portions={data.portions} me={me} members={members} onClose={() => setOpen(null)}
          onOffer={async (d, cook) => { await createOffer(db, { me, to: d.to, dish: recipe.id, date: offerDate(d.when, today), meal: d.meal, how: d.how, cookMyself: cook }); }} />
      ) : null}
    </>
  );
}
```

В `MenuPage.tsx`:
- состояние вкладки берётся из `useSearchParams()`: `panel = params.get('panel') === 'ideas' ? 'ideas' : 'week'`;
- под `Header` в обеих ветках (неделя есть и недели нет) — вкладки, точно как `menuSegs` в макете:

```tsx
<div className="segs" role="tablist" aria-label="Меню">
  <button type="button" role="tab" aria-selected={panel === 'week'} onClick={() => setParams({})}>Неделя</button>
  <button type="button" role="tab" aria-selected={panel === 'ideas'} onClick={() => setParams({ panel: 'ideas' })}>Что покушать</button>
</div>
```

- при `panel === 'ideas'` вместо содержимого недели рендерится `<IdeasPanel me={me} members={members} db={db} today={today} />`.

В `components.css` перенести из `mockups/styles.css` правила `.idea-grid`, `.idea`, `.idea:active`, `.idea.wide`, `.idea b`, `.idea.wide b`, `.i-about`, `.i-meta`, `.i-min`, `.i-min small`, `.idea.wide .i-meta`, `.i-dima`, `.i-dima::before` (строки 298–310), `.notice` (312), `.row.offer .row-btn` (313), `.meta-line` (325) — те, которых ещё нет.

- [ ] **Step 4: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, в том числе search (2), offerActions (3), IdeasPanel (4).

```bash
git add app/src && git commit -m "feat: add «Что покушать» with collections, search, recipes and dish offers" && git push origin main
```

---

### Task 7: Предложения в дне меню

**Files:**
- Create: `app/src/features/ideas/OfferRow.tsx`, `app/src/features/menu/offers-in-menu.test.tsx`
- Modify: `app/src/features/menu/useMenu.ts` (предложения недели), `app/src/features/menu/MenuPage.tsx`

**Interfaces:**
- Consumes: `DishOffer`, `takeOffer`, `MEAL_FOR` (задача 6).
- Produces:
  - `OfferRow({ offer, me, members, dishName, onTake, onOpen? })` — общая строка для Меню и Главной;
  - `offerSub(offer, me, members): string`;
  - `useMenu(...)` возвращает ещё `offers: DishOffer[]` за текущую неделю (кроме отклонённых).

- [ ] **Step 1: Падающий тест**

`app/src/features/menu/offers-in-menu.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type DishOffer } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);
const offer = (o: Partial<DishOffer>): DishOffer => ({ id: 'o1', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'br-syrniki', on_date: '2026-10-13', meal: 'snack', how: 'over', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null, ...o });

describe('offers in the menu', () => {
  it('lists the day offers and lets me take one', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put(offer({}));
    render(<MemoryRouter><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('Предложили на этот день')).toBeInTheDocument();
    expect(screen.getByText('Мама просит на полдник, поверх меню')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сделаю' }));
    await waitFor(async () => expect((await db.dish_offers.get('o1'))?.status).toBe('taken'));
    expect(await screen.findByText('готовит Папа · на полдник')).toBeInTheDocument();
  });

  it('shows a taken «instead» dish in place of the menu dish', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put(offer({ dish_id: 'mn-plov', meal: 'dinner', how: 'instead', status: 'taken', taken_by: 'm-papa' }));
    render(<MemoryRouter><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /Ужин: Плов/ })).toHaveTextContent('вместо: котлеты');
  });
});
```

Run: `npm test -- src/features/menu/offers-in-menu.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`app/src/features/ideas/OfferRow.tsx`:

```tsx
import type { DishOffer } from '../../data/db';
import type { Member } from '../family/useFamily';
import { MEAL_FOR } from './offerActions';

export function offerSub(o: DishOffer, me: Member, members: Member[]): string {
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const how = o.how === 'over' ? 'поверх меню' : 'вместо блюда';
  if (o.status === 'taken') return `готовит ${name(o.taken_by)} · ${MEAL_FOR[o.meal]}`;
  if (o.from_member === me.id) return `вы предложили · кому: ${o.to_member ? name(o.to_member) : 'всем'} · ${MEAL_FOR[o.meal]}`;
  if (o.to_member === me.id) return `${name(o.from_member)} просит ${MEAL_FOR[o.meal]}, ${how}`;
  return `${name(o.from_member)} предлагает всем ${MEAL_FOR[o.meal]}, ${how}`;
}

export default function OfferRow({ offer, me, members, dishName, onTake }: { offer: DishOffer; me: Member; members: Member[]; dishName: string; onTake: () => void }) {
  const from = members.find((m) => m.id === offer.from_member);
  const canTake = offer.status === 'open' && offer.from_member !== me.id && (offer.to_member === me.id || offer.to_member === null);
  return (
    <div className="row offer">
      <span className="av sm" style={{ ['--c' as string]: from?.color ?? 'var(--k-ink-2)' }} aria-hidden="true">{from?.name.slice(0, 1) ?? '?'}</span>
      <span className="row-main"><b>{dishName}</b><small>{offerSub(offer, me, members)}</small></span>
      {canTake ? <button type="button" className="btn soft sm" onClick={onTake}>Сделаю</button> : null}
    </div>
  );
}
```

В `useMenu.ts` добавить к результату предложения за неделю:

```ts
const weekEnd = addDaysIso(start, 6);
const offers = (await db.dish_offers.where('household_id').equals(householdId).toArray())
  .filter((o) => !o.deleted_at && o.status !== 'declined' && o.on_date >= start && o.on_date <= weekEnd);
```

Вернуть `offers` в объекте.

В `MenuPage.tsx`:
- дата выбранного дня: `const dayIso = addDaysIso(current.start, day)`;
- в `row(meal)`: если есть взятое предложение `how === 'instead'` на этот день и приём, показывать его блюдо, а в `extra` — `вместо: ${lower(name(s?.dish_id))}`;

```tsx
const swap = data.offers.find((o) => o.on_date === dayIso && o.meal === meal && o.how === 'instead' && o.status === 'taken');
if (swap) { extra.unshift(`вместо: ${lower(main)}`); main = name(swap.dish_id); }
```

- под строками приёмов пищи, перед подсказкой:

```tsx
{data.offers.filter((o) => o.on_date === dayIso).length ? <p className="tl-group">Предложили на этот день</p> : null}
{data.offers.filter((o) => o.on_date === dayIso).map((o) => (
  <OfferRow key={o.id} offer={o} me={me} members={members} dishName={name(o.dish_id)} onTake={() => takeOffer(db, o, me)} />
))}
```

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS.

```bash
git add app/src && git commit -m "feat: show dish offers in the menu day and dishes cooked instead" && git push origin main
```

---

### Task 8: Главная

**Files:**
- Create: `app/src/features/home/main.ts`, `main.test.ts`, `useHome.ts`, `HomePage.tsx`, `HomePage.test.tsx`, `app/src/lib/mealTimes.ts`
- Modify: `app/src/app/App.tsx` (маршрут `/`)

**Interfaces:**
- Consumes: `soupOn`, `MEAL_LABEL`, `MEALS`, `mondayOf`, `dayOfWeek`, `addDaysIso`; `OfferRow`, `takeOffer`; `listTotals`, `rub`, `visibleItems`.
- Produces:
  - `mainThing(a)` → `{ kind: 'offer'; offer } | { kind: 'urgent'; item } | { kind: 'dinner'; text } | { kind: 'no-week' }`;
  - `greeting(d: Date)`, `dateLine(d: Date)`;
  - `getMealTimes(): Record<Meal, string>`, `setMealTimes(t)`;
  - `HomePage({ me, members, db?, today? })`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/home/main.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DishOffer, ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import { dateLine, greeting, mainThing } from './main';

const papa = { id: 'm-papa' } as Member;
const offer = { id: 'o1', from_member: 'm-mama', to_member: 'm-papa', status: 'open', on_date: '2026-10-13' } as DishOffer;
const milk = { id: 'u:1', title: 'Молоко', urgent: true } as ShoppingItem;

describe('home main thing', () => {
  it('puts a dish offered to me first, then an urgent purchase, then dinner', () => {
    const base = { me: papa, today: '2026-10-13', offers: [] as DishOffer[], urgent: [] as ShoppingItem[], dinner: 'котлеты', hasWeek: true };
    expect(mainThing({ ...base, offers: [offer], urgent: [milk] })).toEqual({ kind: 'offer', offer });
    expect(mainThing({ ...base, offers: [{ ...offer, from_member: 'm-papa' }], urgent: [milk] })).toEqual({ kind: 'urgent', item: milk });
    expect(mainThing(base)).toEqual({ kind: 'dinner', text: 'котлеты' });
    expect(mainThing({ ...base, hasWeek: false, dinner: null })).toEqual({ kind: 'no-week' });
  });
  it('greets by the time of day and names the date', () => {
    expect(greeting(new Date(2026, 9, 13, 7, 0))).toBe('Доброе утро');
    expect(greeting(new Date(2026, 9, 13, 14, 0))).toBe('Добрый день');
    expect(greeting(new Date(2026, 9, 13, 20, 0))).toBe('Добрый вечер');
    expect(greeting(new Date(2026, 9, 13, 2, 0))).toBe('Доброй ночи');
    expect(dateLine(new Date(2026, 9, 13))).toBe('вторник, 13 октября');
  });
});
```

`app/src/features/home/HomePage.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { regenerateWeekList } from '../shop/menuList';
import HomePage from './HomePage';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const dima: Member = { ...papa, id: 'm-dima', user_id: null, name: 'Дима', role: 'child', is_owner: false, portion: 0.5 };
const TUESDAY_MORNING = new Date(2026, 9, 13, 11, 40);

async function ready() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  await regenerateWeekList(db, 'w-cur');
  return db;
}

describe('HomePage', () => {
  it('greets, shows the family and today with the next meal large', async () => {
    const db = await ready();
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Доброе утро, Папа' })).toBeInTheDocument();
    expect(screen.getByText('вторник, 13 октября')).toBeInTheDocument();
    expect(screen.getByText('без входа')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ужин в 19:00 — котлеты' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Борщ, 2-й день из 7/ })).toHaveTextContent('Обед');
    expect(screen.getByRole('link', { name: /Покупки/ })).toHaveTextContent('9');
  });

  it('puts an offer for me and an urgent purchase on top', async () => {
    const db = await ready();
    await db.shopping_items.put({ id: 'u:1', household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Молоко', qty: null, unit: null, qty_text: '2 л', dept: 'Другое', urgent: true, est_price: null, added_by: 'm-mama', updated_at: 'x', deleted_at: null });
    const { unmount } = render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Срочно купить: Молоко' })).toBeInTheDocument();
    unmount();
    await db.dish_offers.put({ id: 'o1', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'mn-plov', on_date: '2026-10-13', meal: 'dinner', how: 'instead', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Мама просит: Плов' })).toBeInTheDocument();
    expect(screen.getByText('Предложили на сегодня')).toBeInTheDocument();
  });

  it('asks to choose a week when there is none', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Меню на эту неделю ещё не выбрано' })).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/features/home`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`app/src/lib/mealTimes.ts`:

```ts
import { MEAL_TIME, type Meal } from '../features/menu/week';

const KEY = 'fa.mealTimes';
export function getMealTimes(): Record<Meal, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...MEAL_TIME, ...(JSON.parse(raw) as Partial<Record<Meal, string>>) };
  } catch { /* storage unavailable */ }
  return { ...MEAL_TIME };
}
export function setMealTimes(t: Record<Meal, string>) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* storage unavailable */ }
}
```

`app/src/features/home/main.ts`:

```ts
import type { DishOffer, ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';

export type Main = { kind: 'offer'; offer: DishOffer } | { kind: 'urgent'; item: ShoppingItem } | { kind: 'dinner'; text: string } | { kind: 'no-week' };

export function mainThing(a: { me: Member; today: string; offers: DishOffer[]; urgent: ShoppingItem[]; dinner: string | null; hasWeek: boolean }): Main {
  const offer = a.offers.find((o) => o.status === 'open' && o.on_date === a.today && o.from_member !== a.me.id && (o.to_member === a.me.id || o.to_member === null));
  if (offer) return { kind: 'offer', offer };
  if (a.urgent.length) return { kind: 'urgent', item: a.urgent[0] };
  return a.hasWeek && a.dinner ? { kind: 'dinner', text: a.dinner } : { kind: 'no-week' };
}

const DAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const greeting = (d: Date) => { const h = d.getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : 'Добрый вечер'; };
export const dateLine = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
```

`app/src/features/home/useHome.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb, Recipe, ShoppingMark } from '../../data/db';
import { addDaysIso, dayOfWeek, mondayOf } from '../menu/week';
import { visibleItems } from '../shop/useShop';

export function useHome(db: LocalDb, householdId: string, today: Date) {
  const start = mondayOf(today);
  const todayIso = addDaysIso(start, dayOfWeek(today));
  return useLiveQuery(async () => {
    const week = await db.weeks.where('[household_id+starts_on]').equals([householdId, start]).filter((w) => !w.deleted_at).first();
    const slots = week ? await db.week_slots.where('week_id').equals(week.id).toArray() : [];
    const ids = [...new Set(slots.flatMap((s) => [s.dish_id, s.side_id, s.salad_id]).filter((x): x is string => !!x))];
    const offers = (await db.dish_offers.where('household_id').equals(householdId).toArray()).filter((o) => !o.deleted_at && o.status !== 'declined' && o.on_date === todayIso);
    const recipes = new Map((await db.recipes.bulkGet([...ids, ...offers.map((o) => o.dish_id)])).filter((r): r is Recipe => !!r).map((r) => [r.id, r]));
    const items = visibleItems((await db.shopping_items.where('household_id').equals(householdId).toArray()).filter((i) => !i.deleted_at), week?.status === 'approved' ? week.id : null);
    const marks = new Map((await db.shopping_marks.bulkGet(items.map((i) => i.id))).filter((m): m is ShoppingMark => !!m).map((m) => [m.item_id, m]));
    return { week, slots, recipes, offers, items, marks, todayIso };
  }, [db, householdId, start, todayIso]);
}
```

`app/src/features/home/HomePage.tsx`:

```tsx
import { Link, NavLink } from 'react-router-dom';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import { localDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { getMealTimes } from '../../lib/mealTimes';
import { dayOfWeek, MEAL_LABEL, MEALS, soupOn, type Meal } from '../menu/week';
import OfferRow from '../ideas/OfferRow';
import { takeOffer } from '../ideas/offerActions';
import { listTotals, rub } from '../shop/build';
import { useHome } from './useHome';
import { dateLine, greeting, mainThing } from './main';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default function HomePage({ me, members, db = localDb, today = new Date() }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const data = useHome(db, me.household_id, today);
  const times = getMealTimes();
  const avatar = <NavLink to="/settings" className="av" style={{ ['--c' as string]: me.color }} aria-label="Настройки и профиль">{me.name.slice(0, 1)}</NavLink>;
  const head = <Header title={`${greeting(today)}, ${me.name}`} subtitle={dateLine(today)} action={avatar} />;
  if (!data) return head;

  const d = dayOfWeek(today);
  const name = (id: string | null | undefined) => (id ? data.recipes.get(id)?.name ?? '' : '');
  const slot = (m: Meal) => data.slots.find((s) => s.day === d && s.meal === m);
  const text = (m: Meal) => {
    const s = slot(m);
    if (m === 'lunch') { const pot = soupOn(data.slots, d); if (pot) return `${name(pot.dish_id)}${pot.of > 1 ? `, ${pot.nth}-й день из ${pot.of}` : ''}`; }
    if (m === 'snack' && !s?.dish_id && s?.simple) return s.simple.simple;
    return [name(s?.dish_id), s?.side_id ? lower(name(s.side_id)) : ''].filter(Boolean).join(' + ');
  };
  const urgent = data.items.filter((i) => i.urgent && !data.marks.get(i.id)?.bought);
  const dinner = name(slot('dinner')?.dish_id);
  const main = mainThing({ me, today: data.todayIso, offers: data.offers, urgent, dinner: data.week && dinner ? lower(dinner) : null, hasWeek: !!data.week });
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const next = MEALS.find((m) => mins(times[m]) > nowMin);
  const totals = listTotals(data.items.map((i) => ({ est: i.est_price, real: data.marks.get(i.id)?.price_real ?? null, bought: !!data.marks.get(i.id)?.bought })));
  const who = (id: string) => members.find((m) => m.id === id)?.name ?? 'Кто-то';

  return (
    <>
      {head}
      <div className="family" aria-label="Семья">
        {members.map((m) => (
          <div className="fam" key={m.id} style={{ ['--c' as string]: m.color }}>
            <span className="av" aria-hidden="true">{m.name.slice(0, 1)}</span><b>{m.name}</b><small>{m.user_id ? (m.role === 'parent' ? 'родитель' : 'ребёнок') : 'без входа'}</small>
          </div>
        ))}
      </div>
      <section className="hero" aria-label="Главное сейчас">
        {main.kind === 'offer' ? (
          <>
            <h2>{who(main.offer.from_member)} просит: {name(main.offer.dish_id)}</h2>
            <p>Сегодня {MEAL_LABEL[main.offer.meal].toLowerCase()}, {main.offer.how === 'over' ? 'поверх меню' : 'вместо блюда по меню'}.</p>
            <div className="hero-chips">
              <button type="button" className="hero-chip primary" onClick={() => takeOffer(db, main.offer, me)}><Icon name="check" />Сделаю</button>
              <Link className="hero-chip" to="/menu?panel=ideas">Рецепт</Link>
            </div>
          </>
        ) : main.kind === 'urgent' ? (
          <>
            <h2>Срочно купить: {main.item.title}</h2>
            <p>{[main.item.qty_text, main.item.added_by ? `добавлено: ${who(main.item.added_by)}` : ''].filter(Boolean).join(' · ')}</p>
            <div className="hero-chips"><Link className="hero-chip primary" to="/shop"><Icon name="cart" />Покупки</Link></div>
          </>
        ) : main.kind === 'dinner' ? (
          <>
            <h2>Ужин в {times.dinner} — {main.text}</h2>
            <p>{urgent.length ? '' : 'Срочных покупок нет.'}</p>
            <div className="hero-chips"><Link className="hero-chip primary" to="/menu"><Icon name="menu" />Меню на неделю</Link></div>
          </>
        ) : (
          <>
            <h2>Меню на эту неделю ещё не выбрано</h2>
            <p>Возьмите шаблон — меню и покупки соберутся сами.</p>
            <div className="hero-chips"><Link className="hero-chip primary" to="/menu">Выбрать неделю</Link></div>
          </>
        )}
      </section>
      {data.week ? (
        <>
          <div className="sec-h"><h2>Сегодня едим</h2><Link className="more" to="/menu">Меню</Link></div>
          {next ? (
            <Link className="meal-now" to="/menu"><span className="mn-time">{times[next]}</span><span className="mn-main"><b>{text(next) || 'Не выбрано'}</b><small>{MEAL_LABEL[next]}</small></span></Link>
          ) : null}
          <section className="card">
            {MEALS.filter((m) => m !== next).map((m) => (
              <div className={`row ${mins(times[m]) < nowMin ? 'past' : ''}`} key={m}><span className="tl-t">{times[m]}</span><span className="row-main"><b>{text(m) || 'Не выбрано'}</b><small>{MEAL_LABEL[m]}</small></span></div>
            ))}
            {data.offers.length ? <p className="tl-group">Предложили на сегодня</p> : null}
            {data.offers.map((o) => <OfferRow key={o.id} offer={o} me={me} members={members} dishName={name(o.dish_id)} onTake={() => takeOffer(db, o, me)} />)}
          </section>
        </>
      ) : null}
      <div className="bento">
        <Link className="tile wide" to="/shop" style={{ ['--h' as string]: 'var(--k-shop)' }}>
          <span className="t-k"><Icon name="cart" />Покупки</span><span className="t-v num">{totals.count - totals.doneCount}</span>
          <span className="t-s">осталось купить{totals.left ? ` · ≈ ${rub(totals.left)}` : ''}</span>
        </Link>
      </div>
    </>
  );
}
```

Проверка второго теста Главной: «Борщ, 2-й день из 7». Обед во вторник — суп из кастрюли на 7 дней. Ссылка `.meal-now` содержит текст «Обед», поэтому её имя совпадает с `/Борщ, 2-й день из 7/`. Плитка «Покупки» показывает 9 некупленных позиций.

Ссылки-кнопки на Главной (`.hero-chip`, `.tile`, `.meal-now` как `<Link>`) не должны подчёркиваться. В `components.css` добавить:

```css
a.hero-chip, a.tile, a.meal-now { text-decoration: none; color: inherit; }
```

В `App.tsx` маршрут `/` → `<HomePage me={me} members={fam.members} />`.

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, в том числе main (2) и HomePage (3).

```bash
git add app/src && git commit -m "feat: add the Home screen with the family, the main thing, today's meals and shopping" && git push origin main
```

---

### Task 9: Настройки еды и уведомлений

**Files:**
- Create: `app/src/features/settings/FoodCard.tsx`, `FoodCard.test.tsx`, `NotifyCard.tsx`, `NotifyCard.test.tsx`, `memberSettings.ts`
- Modify: `app/src/features/settings/Settings.tsx` (карточки «Еда» и «Уведомления»), `Settings.test.tsx` (подмена карточек)

**Interfaces:**
- Consumes: `writeLocal`, `NotEat`, `getMealTimes`, `setMealTimes`, `supabase`.
- Produces:
  - `loadMemberSettings(memberId, db?)` → `{ meal_times: string[]; notify: Record<string, boolean> } | null`;
  - `saveNotify(memberId, notify, db?)`, `saveMealTimes(memberId, times, db?)`;
  - `FoodCard({ me, db? })`;
  - `NotifyCard({ me, client?, push? })` — проп `push` появится в задаче 10.

- [ ] **Step 1: Падающие тесты**

`app/src/features/settings/FoodCard.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import FoodCard from './FoodCard';

vi.mock('./memberSettings', () => ({ saveMealTimes: vi.fn(() => Promise.resolve()) }));
const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('FoodCard', () => {
  it('lets a parent add and remove what the family does not eat', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<FoodCard me={papa} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /Не едим/ }));
    await userEvent.type(screen.getByLabelText('Продукт или блюдо'), 'грибы');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await waitFor(async () => expect((await db.not_eat.toArray()).map((x) => x.ref)).toEqual(['грибы']));
    await userEvent.click(await screen.findByRole('button', { name: 'Убрать: грибы' }));
    await waitFor(async () => expect((await db.not_eat.toArray())[0].deleted_at).toBeTruthy());
  });

  it('shows the list read-only to a child', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.not_eat.put({ household_id: 'h1', kind: 'item', ref: 'печень', updated_at: 'x', deleted_at: null });
    render(<FoodCard me={{ ...papa, role: 'child' }} db={db} />);
    expect(await screen.findByText('печень')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Не едим/ }));
    expect(screen.queryByLabelText('Продукт или блюдо')).toBeNull();
  });

  it('saves meal times on this phone and for the member', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<FoodCard me={papa} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /Время еды/ }));
    fireEvent.change(screen.getByLabelText('Ужин'), { target: { value: '18:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(JSON.parse(localStorage.getItem('fa.mealTimes')!).dinner).toBe('18:30');
  });
});
```

`app/src/features/settings/NotifyCard.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../family/useFamily';
import NotifyCard from './NotifyCard';

const load = vi.fn(() => Promise.resolve({ meal_times: [], notify: { offers: true, votes: true, shop: false, quiet: true } }));
const save = vi.fn(() => Promise.resolve());
vi.mock('./memberSettings', () => ({ loadMemberSettings: () => load(), saveNotify: (...a: unknown[]) => save(...(a as [])) }));
const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('NotifyCard', () => {
  it('shows the member switches and saves a change', async () => {
    render(<NotifyCard me={papa} />);
    const shop = await screen.findByRole('switch', { name: 'Кто идёт в магазин' });
    await waitFor(() => expect(shop).toHaveAttribute('aria-checked', 'false'));
    await userEvent.click(shop);
    expect(shop).toHaveAttribute('aria-checked', 'true');
    expect(save).toHaveBeenCalledWith('m-papa', { offers: true, votes: true, shop: true, quiet: true });
  });
});
```

Run: `npm test -- src/features/settings`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`app/src/features/settings/memberSettings.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type Db = Pick<SupabaseClient, 'from'>;
export type MemberSettings = { meal_times: string[]; notify: Record<string, boolean> };

export async function loadMemberSettings(memberId: string, db: Db = supabase): Promise<MemberSettings | null> {
  const { data } = await db.from('member_settings').select('meal_times, notify').eq('member_id', memberId).maybeSingle();
  return (data as MemberSettings | null) ?? null;
}
export async function saveNotify(memberId: string, notify: Record<string, boolean>, db: Db = supabase) {
  const { error } = await db.from('member_settings').update({ notify, updated_at: new Date().toISOString() }).eq('member_id', memberId);
  if (error) throw new Error(error.message);
}
export async function saveMealTimes(memberId: string, times: string[], db: Db = supabase) {
  const { error } = await db.from('member_settings').update({ meal_times: times, updated_at: new Date().toISOString() }).eq('member_id', memberId);
  if (error) throw new Error(error.message);
}
```

`app/src/features/settings/FoodCard.tsx`:

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Icon from '../shell/Icon';
import Sheet from '../menu/Sheet';
import { localDb, type LocalDb } from '../../data/db';
import { writeLocal } from '../../data/sync';
import type { Member } from '../family/useFamily';
import { getMealTimes, setMealTimes } from '../../lib/mealTimes';
import { MEAL_LABEL, MEALS, type Meal } from '../menu/week';
import { saveMealTimes } from './memberSettings';

export default function FoodCard({ me, db = localDb }: { me: Member; db?: LocalDb }) {
  const list = useLiveQuery(async () => (await db.not_eat.where('household_id').equals(me.household_id).toArray()).filter((x) => !x.deleted_at), [db, me.household_id]) ?? [];
  const [sheet, setSheet] = useState<'not-eat' | 'times' | null>(null);
  const [ref, setRef] = useState('');
  const [times, setTimes] = useState(getMealTimes());
  const parent = me.role === 'parent';
  const add = async () => { await writeLocal(db, 'not_eat', [{ household_id: me.household_id, kind: 'item', ref: ref.trim().toLowerCase(), deleted_at: null }]); setRef(''); };
  const remove = (r: string) => writeLocal(db, 'not_eat', [{ household_id: me.household_id, kind: 'item', ref: r, deleted_at: new Date().toISOString() }]);
  const saveTimes = async () => {
    setMealTimes(times);
    setSheet(null);
    try { await saveMealTimes(me.id, MEALS.map((m) => times[m])); } catch { /* kept on this phone; the server copy updates next time */ }
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Еда</h2></div>
      <button type="button" className="row set-row" onClick={() => setSheet('not-eat')}>
        <span className="row-main"><b>Не едим</b><small>{list.length ? list.map((x) => x.ref).join(', ') : 'ничего не убрано'}</small></span><Icon name="chev" className="chev" />
      </button>
      <button type="button" className="row set-row" onClick={() => setSheet('times')}>
        <span className="row-main"><b>Время еды</b><small>{MEALS.map((m) => times[m]).join(', ')}</small></span><Icon name="chev" className="chev" />
      </button>
      {sheet === 'not-eat' ? (
        <Sheet title="Не едим" sub="Блюда с этими продуктами не покажутся в «Что покушать» и в поиске." onClose={() => setSheet(null)}>
          <div style={{ margin: '0 16px 16px' }}>
            {list.map((x) => (
              <div className="row" key={x.ref}><span className="row-main"><b>{x.ref}</b></span>
                {parent ? <button type="button" className="round-btn" aria-label={`Убрать: ${x.ref}`} onClick={() => remove(x.ref)}><Icon name="x" /></button> : null}</div>
            ))}
            {parent ? (
              <div className="btns" style={{ marginTop: 12 }}>
                <label className="field" style={{ flex: 1 }}>Продукт или блюдо<input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} placeholder="Например, грибы" /></label>
                <button type="button" className="btn soft" disabled={!ref.trim()} onClick={add}>Добавить</button>
              </div>
            ) : <p className="note">Список ведут родители.</p>}
          </div>
        </Sheet>
      ) : null}
      {sheet === 'times' ? (
        <Sheet title="Время еды" sub="По нему Главная показывает, что дальше." onClose={() => setSheet(null)} actions={<button type="button" className="btn" onClick={saveTimes}>Сохранить</button>}>
          <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
            {MEALS.map((m: Meal) => <label className="field" key={m}>{MEAL_LABEL[m]}<input type="time" value={times[m]} onChange={(e) => setTimes({ ...times, [m]: e.target.value })} /></label>)}
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
```

`app/src/features/settings/NotifyCard.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import type { Member } from '../family/useFamily';
import { loadMemberSettings, saveNotify } from './memberSettings';

const ROWS: Array<[string, string, string?]> = [
  ['offers', 'Предложения блюд', '«Сделай сегодня…»'],
  ['votes', 'Голосование за меню'],
  ['shop', 'Кто идёт в магазин'],
  ['quiet', 'Тихие часы', 'с 22:00 до 8:00 без звука'],
];

export default function NotifyCard({ me, push }: { me: Member; push?: ReactNode }) {
  const [n, setN] = useState<Record<string, boolean> | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { loadMemberSettings(me.id).then((s) => setN(s?.notify ?? {})).catch(() => setN({})); }, [me.id]);
  const flip = async (k: string) => {
    const next = { ...(n ?? {}), [k]: !(n ?? {})[k] };
    setN(next);
    try { await saveNotify(me.id, next); setMsg(''); } catch { setMsg('Нет связи: настройка сохранится, когда появится интернет.'); }
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Уведомления</h2></div>
      {push}
      {ROWS.map(([k, title, sub]) => (
        <div className="row" key={k}>
          <span className="row-main"><b>{title}</b>{sub ? <small>{sub}</small> : null}</span>
          <button type="button" className="switch" role="switch" aria-checked={!!n?.[k]} aria-label={title} disabled={!n} onClick={() => flip(k)}><i /></button>
        </div>
      ))}
      {msg ? <p className="note" role="status">{msg}</p> : null}
    </section>
  );
}
```

В `Settings.tsx` перед `<SyncStatus />`:

```tsx
<FoodCard me={me} />
<NotifyCard me={me} />
```

В `Settings.test.tsx`:

```ts
vi.mock('./FoodCard', () => ({ default: () => null }));
vi.mock('./NotifyCard', () => ({ default: () => null }));
```

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS.

```bash
git add app/src && git commit -m "feat: add not-eat, meal times and notification settings" && git push origin main
```

---

### Task 10: Пуши

**Files:**
- Create:
  - `supabase/functions/_shared/webpush.ts`, `supabase/functions/_shared/messages.ts`, `supabase/functions/notify/index.ts`;
  - `supabase/migrations/20261014000800_push_hooks.sql`;
  - `app/tests/push/webpush.test.ts`, `app/tests/push/messages.test.ts`;
  - `app/src/lib/push.ts`, `app/src/lib/push.test.ts`;
  - `app/public/push-sw.js`;
  - `app/scripts/vapid.mjs`.
- Modify: `app/vite.config.ts` (`workbox.importScripts`), `app/src/features/settings/Settings.tsx` (строка «Пуши на этом телефоне»).

**Interfaces:**
- Consumes: таблицы `push_subscriptions`, `push_log`, `member_settings`, `members`, `weeks`, `dish_offers`, `shop_trips`, `week_templates`, `recipes`.
- Produces:
  - `b64urlEncode`, `b64urlDecode`;
  - `encryptPayload(payload: Uint8Array, p256dh: string, auth: string, salt?: Uint8Array, asKeys?: CryptoKeyPair): Promise<Uint8Array>`;
  - `vapidAuthorization(endpoint: string, subject: string, publicKey: string, privateJwk: JsonWebKey, now?: number): Promise<string>`;
  - `sendPush(sub, payload, vapid): Promise<number>` — статус ответа;
  - `compose(ev, today)` → `{ title; body; url; pref; tag }`;
  - `pushSupport()`, `subscribePush(me, client?)`, `unsubscribePush(client?)`, `pushIsOn()`.

- [ ] **Step 1: Падающие тесты**

`app/tests/push/webpush.test.ts` расшифровывает своей, независимой реализацией RFC 8291 на `node:crypto` и проверяет подпись VAPID:

```ts
// @vitest-environment node
import { createDecipheriv, createECDH, hkdfSync, randomBytes, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, encryptPayload, vapidAuthorization } from '../../../supabase/functions/_shared/webpush';

const info = (label: string, extra = Buffer.alloc(0)) => Buffer.concat([Buffer.from(label, 'utf8'), Buffer.from([0]), extra]);

describe('web push encryption (RFC 8291)', () => {
  it('produces a body the browser can decrypt', async () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = randomBytes(16);
    const text = JSON.stringify({ title: 'Мама просит: Плов', body: 'на ужин сегодня' });
    const body = Buffer.from(await encryptPayload(new TextEncoder().encode(text), b64urlEncode(ua.getPublicKey()), b64urlEncode(auth)));

    const salt = body.subarray(0, 16);
    const rs = body.readUInt32BE(16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const ciphertext = body.subarray(21 + idlen);
    expect(rs).toBe(4096);
    const ecdh = ua.computeSecret(asPublic);
    const ikm = Buffer.from(hkdfSync('sha256', ecdh, auth, Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), ua.getPublicKey(), asPublic]), 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: aes128gcm'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: nonce'), 12));
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
    const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
    expect(plain[plain.length - 1]).toBe(2);
    expect(plain.subarray(0, plain.length - 1).toString('utf8')).toBe(text);
  });

  it('signs a VAPID token the push service can verify', async () => {
    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await webcrypto.subtle.exportKey('jwk', keys.privateKey);
    const pub = b64urlEncode(new Uint8Array(await webcrypto.subtle.exportKey('raw', keys.publicKey)));
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', 'https://github.com/Gubanchuk/Family_App', pub, jwk, 1_800_000_000);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(pub);
    const [h, p, s] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'https://github.com/Gubanchuk/Family_App' });
    const ok = await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
```

`app/tests/push/messages.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compose } from '../../../supabase/functions/_shared/messages';

describe('push texts', () => {
  const today = '2026-10-13';
  it('announces a proposed week', () => {
    expect(compose({ kind: 'weeks', author: 'Сын', template: 'Быстрая', startsOn: '2026-10-19' }, today)).toEqual({
      title: 'Сын предлагает меню на 19–25 октября', body: 'Неделя «Быстрая». Проголосуйте в приложении.', url: '/menu', pref: 'votes', tag: 'week-2026-10-19',
    });
  });
  it('announces a dish offer for today or another day', () => {
    expect(compose({ kind: 'dish_offers', author: 'Мама', dish: 'Плов', meal: 'dinner', onDate: '2026-10-13', toAll: false }, today).title).toBe('Мама просит: Плов');
    expect(compose({ kind: 'dish_offers', author: 'Мама', dish: 'Плов', meal: 'dinner', onDate: '2026-10-14', toAll: true }, today).body).toBe('Завтра на ужин. Предложено всем.');
  });
  it('announces a shop trip', () => {
    expect(compose({ kind: 'shop_trips', author: 'Папа' }, today)).toEqual({ title: 'Папа идёт в магазин', body: 'Добавьте в список, что нужно купить.', url: '/shop', pref: 'shop', tag: 'shop' });
  });
});
```

`app/src/lib/push.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribePush } from './push';
import type { Member } from '../features/family/useFamily';

const me: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('subscribePush', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('subscribes this phone and stores the keys for the member', async () => {
    const sub = { endpoint: 'https://push.example/1', toJSON: () => ({ keys: { p256dh: 'P', auth: 'A' } }) };
    const pushManager = { getSubscription: vi.fn(() => Promise.resolve(null)), subscribe: vi.fn(() => Promise.resolve(sub)) };
    vi.stubGlobal('Notification', { requestPermission: () => Promise.resolve('granted') });
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true });
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    expect(await subscribePush(me, { from: () => ({ upsert }) } as never)).toBe('on');
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(upsert).toHaveBeenCalledWith({ endpoint: 'https://push.example/1', household_id: 'h1', member_id: 'm-papa', p256dh: 'P', auth: 'A' });
  });

  it('reports a refusal without subscribing', async () => {
    vi.stubGlobal('Notification', { requestPermission: () => Promise.resolve('denied') });
    expect(await subscribePush(me, { from: vi.fn() } as never)).toBe('denied');
  });
});
```

Run: `npm test -- tests/push src/lib/push.test.ts`
Expected: FAIL — модулей нет.

- [ ] **Step 2: Шифрование и тексты**

`supabase/functions/_shared/webpush.ts`:

```ts
// Web Push on Web Crypto only (RFC 8291 aes128gcm, RFC 8292 VAPID): works in Deno and in Node tests.
const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string, salt = crypto.getRandomValues(new Uint8Array(16)), asKeys?: CryptoKeyPair): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh);
  const as = asKeys ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(b64urlDecode(auth), ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

export async function vapidAuthorization(endpoint: string, subject: string, publicKey: string, privateJwk: JsonWebKey, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const part = (o: unknown) => b64urlEncode(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud, exp: now + 12 * 3600, sub: subject })}`;
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${publicKey}`;
}

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type Vapid = { subject: string; publicKey: string; privateJwk: JsonWebKey };

export async function sendPush(sub: Subscription, payload: unknown, vapid: Vapid): Promise<number> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid.subject, vapid.publicKey, vapid.privateJwk),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
    },
    body,
  });
  return res.status;
}
```

`supabase/functions/_shared/messages.ts`:

```ts
export type Ev =
  | { kind: 'weeks'; author: string; template: string; startsOn: string }
  | { kind: 'dish_offers'; author: string; dish: string; meal: 'breakfast' | 'lunch' | 'snack' | 'dinner'; onDate: string; toAll: boolean }
  | { kind: 'shop_trips'; author: string };

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MEAL_FOR = { breakfast: 'на завтрак', lunch: 'на обед', snack: 'на полдник', dinner: 'на ужин' };
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const days = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

function weekLabel(start: string) {
  const a = parse(start);
  const b = new Date(a.getTime() + 6 * 86400000);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

export function compose(e: Ev, today: string) {
  if (e.kind === 'weeks') {
    return { title: `${e.author} предлагает меню на ${weekLabel(e.startsOn)}`, body: `Неделя «${e.template}». Проголосуйте в приложении.`, url: '/menu', pref: 'votes', tag: `week-${e.startsOn}` };
  }
  if (e.kind === 'dish_offers') {
    const d = days(today, e.onDate);
    const when = d === 0 ? 'Сегодня' : d === 1 ? 'Завтра' : `${parse(e.onDate).getUTCDate()} ${MONTHS[parse(e.onDate).getUTCMonth()]}`;
    return { title: `${e.author} просит: ${e.dish}`, body: `${when} ${MEAL_FOR[e.meal]}.${e.toAll ? ' Предложено всем.' : ''}`, url: '/menu?panel=ideas', pref: 'offers', tag: `offer-${e.onDate}` };
  }
  return { title: `${e.author} идёт в магазин`, body: 'Добавьте в список, что нужно купить.', url: '/shop', pref: 'shop', tag: 'shop' };
}
```

- [ ] **Step 3: Функция, триггеры, сервис-воркер, клиент**

`supabase/functions/notify/index.ts`:

```ts
// Sends Web Push for a week proposal, a dish offer or a shop trip. Called by a database trigger
// with { table, id }; re-reads the row itself, so a forged call can only repeat a real event once.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { compose, type Ev } from '../_shared/messages.ts';
import { sendPush } from '../_shared/webpush.ts';

const TABLES = ['weeks', 'dish_offers', 'shop_trips'];

Deno.serve(async (req) => {
  const { table, id } = await req.json().catch(() => ({}));
  if (!TABLES.includes(table) || typeof id !== 'string') return Response.json({ skipped: 'bad request' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { error: claimed } = await db.from('push_log').insert({ kind: table, ref_id: id });
  if (claimed) return Response.json({ skipped: 'already sent' });

  const { data: row } = await db.from(table).select('*').eq('id', id).maybeSingle();
  if (!row) return Response.json({ skipped: 'no row' });
  const authorId: string = table === 'weeks' ? row.proposed_by : table === 'dish_offers' ? row.from_member : row.member_id;
  const { data: members } = await db.from('members').select('id, name, user_id').eq('household_id', row.household_id).is('deleted_at', null);
  const author = members?.find((m) => m.id === authorId)?.name ?? 'Кто-то';
  let ev: Ev;
  if (table === 'weeks') {
    const { data: t } = await db.from('week_templates').select('name').eq('id', row.template_id).maybeSingle();
    ev = { kind: 'weeks', author, template: t?.name ?? 'своя', startsOn: row.starts_on };
  } else if (table === 'dish_offers') {
    if (row.status !== 'open') return Response.json({ skipped: 'not open' });
    const { data: r } = await db.from('recipes').select('name').eq('id', row.dish_id).maybeSingle();
    ev = { kind: 'dish_offers', author, dish: r?.name ?? 'блюдо', meal: row.meal, onDate: row.on_date, toAll: !row.to_member };
  } else {
    ev = { kind: 'shop_trips', author };
  }
  const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const msg = compose(ev, today);
  const targets = (members ?? []).filter((m) => m.user_id && m.id !== authorId && (table !== 'dish_offers' || !row.to_member || row.to_member === m.id)).map((m) => m.id);
  if (!targets.length) return Response.json({ sent: 0 });
  const { data: settings } = await db.from('member_settings').select('member_id, notify').in('member_id', targets);
  const quiet = new Map((settings ?? []).map((s) => [s.member_id, s.notify?.quiet !== false]));
  const wanted = targets.filter((t) => (settings ?? []).find((s) => s.member_id === t)?.notify?.[msg.pref] !== false);
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, member_id, p256dh, auth').in('member_id', wanted);
  const vapid = { subject: Deno.env.get('VAPID_SUBJECT')!, publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!, privateJwk: JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK')!) };
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      const status = await sendPush(s, { ...msg, quiet: quiet.get(s.member_id) ?? true }, vapid);
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else if (status < 300) sent += 1;
    } catch { /* one dead endpoint must not stop the rest */ }
  }
  return Response.json({ sent });
});
```

`supabase/migrations/20261014000800_push_hooks.sql`:

```sql
-- After a week proposal, a dish offer or a shop trip, ask the notify Edge Function to send pushes.
-- pg_net exists on Supabase; the PGlite test database has no network, so the hook is skipped there.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    execute $f$
      create or replace function public.notify_push() returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        perform net.http_post(
          url := 'https://pbipnjlsxkbhdyfebdeo.supabase.co/functions/v1/notify',
          body := jsonb_build_object('table', tg_table_name, 'id', new.id),
          headers := '{"Content-Type": "application/json"}'::jsonb);
        return new;
      end $b$
    $f$;
    execute 'create trigger weeks_notify after insert on public.weeks for each row when (new.status = ''proposed'') execute function public.notify_push()';
    execute 'create trigger dish_offers_notify after insert on public.dish_offers for each row when (new.status = ''open'') execute function public.notify_push()';
    execute 'create trigger shop_trips_notify after insert on public.shop_trips for each row execute function public.notify_push()';
  end if;
end $outer$;
```

`app/public/push-sw.js`:

```js
// Loaded into the generated service worker with importScripts; shows pushes from the notify function.
self.addEventListener('push', (event) => {
  const d = event.data ? event.data.json() : {};
  const h = new Date().getHours();
  event.waitUntil(self.registration.showNotification(d.title || 'Семейный помощник', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, data: { url: d.url || '/' },
    silent: !!d.quiet && (h >= 22 || h < 8),
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if ('focus' in w) { w.navigate(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
```

В `app/vite.config.ts`:

```ts
workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], importScripts: ['/push-sw.js'] },
```

`app/scripts/vapid.mjs` создаёт пару ключей VAPID. Открытый ключ печатается. Закрытый ключ и параметры пишутся в файл секретов по пути из аргумента и в консоль не выводятся:

```js
// Usage: node app/scripts/vapid.mjs <secrets env file>  — prints the public key only.
import { webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', keys.privateKey);
const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', keys.publicKey));
const pub = Buffer.from(raw).toString('base64url');
writeFileSync(process.argv[2], `VAPID_PUBLIC_KEY=${pub}\nVAPID_SUBJECT=https://github.com/Gubanchuk/Family_App\nVAPID_PRIVATE_JWK=${JSON.stringify(jwk)}\n`, { mode: 0o600 });
console.log(pub);
```

`app/src/lib/push.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Member } from '../features/family/useFamily';

// Public half of the VAPID pair; the private half lives only in Supabase secrets.
export const VAPID_PUBLIC_KEY = '<вставить ключ, который напечатал app/scripts/vapid.mjs>';
type Db = Pick<SupabaseClient, 'from'>;

const toBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

export function pushSupport(): 'ok' | 'install-first' | 'unsupported' {
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (has) return 'ok';
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return ios && !window.matchMedia?.('(display-mode: standalone)').matches ? 'install-first' : 'unsupported';
}

export async function subscribePush(me: Member, client: Db = supabase): Promise<'on' | 'denied'> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }));
  const keys = sub.toJSON().keys ?? {};
  const { error } = await client.from('push_subscriptions').upsert({ endpoint: sub.endpoint, household_id: me.household_id, member_id: me.id, p256dh: keys.p256dh, auth: keys.auth });
  if (error) throw new Error(error.message);
  return 'on';
}

export async function unsubscribePush(client: Db = supabase) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function pushIsOn(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}
```

В `Settings.tsx` передать в `NotifyCard` проп `push`:

```tsx
<NotifyCard me={me} push={<PushRow me={me} />} />
```

Строку «Пуши на этом телефоне» объявить там же:

```tsx
function PushRow({ me }: { me: Member }) {
  const support = pushSupport();
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { pushIsOn().then(setOn).catch(() => setOn(false)); }, []);
  if (support !== 'ok') {
    return <div className="row"><span className="row-main"><b>Пуши на этом телефоне</b><small>{support === 'install-first' ? 'Сначала установите приложение на экран «Домой»' : 'Этот браузер не умеет пуши'}</small></span></div>;
  }
  const flip = async () => {
    try {
      if (on) { await unsubscribePush(); setOn(false); return; }
      const r = await subscribePush(me);
      setOn(r === 'on');
      setMsg(r === 'denied' ? 'Уведомления запрещены в настройках телефона.' : '');
    } catch { setMsg('Не получилось включить. Проверьте интернет.'); }
  };
  return (
    <>
      <div className="row"><span className="row-main"><b>Пуши на этом телефоне</b><small>важное дублируется в приложении</small></span>
        <button type="button" className="switch" role="switch" aria-checked={on} aria-label="Пуши на этом телефоне" onClick={flip}><i /></button></div>
      {msg ? <p className="note" role="status">{msg}</p> : null}
    </>
  );
}
```

- [ ] **Step 4: Ключи, тесты, выкладка**

Ключи и секреты создаются до прогона тестов: `push.test.ts` кодирует открытый ключ. Файл секретов лежит во временной папке сессии, после загрузки удаляется:

```bash
node app/scripts/vapid.mjs "$SCRATCH/vapid.env"
npx --yes supabase@2 secrets set --env-file "$SCRATCH/vapid.env"
rm "$SCRATCH/vapid.env"
```

Напечатанный открытый ключ вставить в `VAPID_PUBLIC_KEY` в `app/src/lib/push.ts`.

Run: `npm test`
Expected: PASS — весь набор, в том числе webpush (2), messages (3), push (2).

Потом:

```bash
npx --yes supabase@2 db push --yes
npx --yes supabase@2 functions deploy notify --no-verify-jwt --use-api
npm run build
git add supabase app && git commit -m "feat: send pushes for week proposals, dish offers and shop trips" && git push origin main
```

Expected:
- `db push` применяет `20261014000800_push_hooks.sql`;
- `functions deploy` печатает адрес функции;
- сборка без ошибок.

Если у владельца отключены старые JWT-ключи, переменная `SUPABASE_SERVICE_ROLE_KEY` в функции не сработает. Это видно по ошибке в логах функции. Тогда заменить её на новый секретный ключ: Dashboard → Edge Functions → Secrets.
