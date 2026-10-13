# Меню и работа без интернета — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Семья выбирает неделю из шаблонов, предлагает и утверждает следующую, меняет любое блюдо или целый день, сохраняет свою неделю как шаблон. Всё это работает без сети и сходится между телефонами, когда сеть есть.

**Architecture:**
- Телефон хранит всё нужное в IndexedDB через Dexie: базу рецептов, шаблоны, недели, голоса и очередь изменений.
- Экраны читают только локальную базу через `useLiveQuery`.
- Запись идёт сначала в локальную базу и в очередь `outbox`.
- Синхронизатор отправляет очередь upsert-ами в Supabase и подтягивает строки с `updated_at` новее курсора.
- Запускается при старте, при появлении сети, раз в минуту и по событию Realtime.
- Права проверяет сервер: RLS и триггеры. Отклонённое изменение откатывается к серверной версии.

Это второй план. Первый — каркас: `docs/superpowers/plans/2026-10-14-foundation.md`, выполнен. Третий — «Что покушать», предложения блюд, Главная, Покупки и пуши.

**Tech Stack:**
- то, что уже есть в каркасе;
- dexie 4, dexie-react-hooks 4;
- в тестах fake-indexeddb 6.

**Spec:** `docs/superpowers/specs/2026-10-13-family-app-design.md`. Нужные разделы:
- «Первый срез → Меню»;
- «Каркас»;
- «Модель данных первого среза».

Внешний вид — `mockups/` (версия «Ягода», экран Меню и окна выбора недели, замены блюда и дня) и `DESIGN.md`.

## Global Constraints

- Все ограничения каркаса в силе: русский интерфейс, секреты не в коде, проект Supabase `pbipnjlsxkbhdyfebdeo`, токены «Ягоды».
- **Коммиты.** Коммит после каждой задачи и пуш в `main` — владелец разрешил 14.10.2026.
- **Миграции.** Выкладываются командой `npx supabase@2 db push --yes`, CLI уже залогинен и привязан.
- **Неделя:**
  - начинается с понедельника по местному времени телефона, не по UTC;
  - день недели: 0 — понедельник … 6 — воскресенье;
  - приёмы пищи: `breakfast`, `lunch`, `snack`, `dinner`.
- **Права:**
  - утверждённую неделю меняют и утверждают только родители;
  - ребёнок может предложить неделю и голосовать;
  - каждый голосует только за себя.
- **Суп** — блюдо обеда, кастрюля — подряд идущие дни с одним супом.
- **Конфликт.** Побеждает последняя запись: сервер ставит `updated_at` триггером.
- **Безопасность пуша.** Синхронизатор не отправляет строки чужой семьи: `household_id` берётся из профиля участника.

## Review Focus

1. **Телефон без сети, человек меняет ужин и закрывает приложение.** После повторного открытия замена на месте. Когда сеть появится, она уходит на сервер. Тест — задача 4.
2. **Ребёнок пытается утвердить неделю или поменять блюдо в утверждённой.** Сервер отказывает, на телефоне возвращается серверная версия и появляется понятное сообщение. Тесты — задачи 1 и 4.
3. **На этот понедельник ещё нет недели** (первый запуск или новая неделя). Экран показывает «Неделя не выбрана» и выбор шаблона, а не пустоту или ошибку. Тест — задача 7.
4. **Воскресенье 23:30 и понедельник 00:30 по местному времени.** Текущая неделя считается по местному времени. Тест — задача 2.
5. **В базе больше 1000 строк (рецепты, продукты).** Загрузка в телефон идёт страницами и забирает всё. Тест — задача 5.

---

### Task 1: Схема меню в базе

**Files:**
- Create: `supabase/migrations/20261014000500_menu.sql`
- Create: `app/tests/db/menu.test.ts`

**Interfaces:**
- Consumes: `households`, `members`, `is_parent`, `my_household_ids` (каркас, задача 5), `recipes`, `week_templates`, `template_slots` (каркас, задача 9), `createDb`, `asUser`, `addUser` (каркас, задача 3).
- Produces:
  - `weeks(id uuid pk, household_id, starts_on date — понедельник, template_id text null, status 'proposed'|'approved', proposed_by uuid null, approved_by uuid null, created_at, updated_at, deleted_at)`, уникальна пара `(household_id, starts_on)`;
  - `week_slots(week_id, household_id, day 0..6, meal, dish_id, side_id, salad_id, simple jsonb, updated_at)`, pk `(week_id, day, meal)`;
  - `votes(week_id, member_id, household_id, value 'yes'|'changes', comment, updated_at)`, pk `(week_id, member_id)`;
  - колонка `template_slots.updated_at`;
  - триггер `touch_updated_at` на этих пяти таблицах;
  - триггеры `guard_week_status` и `guard_slot_change`, ошибки `not_a_parent` и `wrong_household`;
  - таблицы `weeks`, `week_slots`, `votes` в публикации `supabase_realtime`.

- [ ] **Step 1: Падающие тесты**

`app/tests/db/menu.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000a1';
const SON = '00000000-0000-0000-0000-0000000000a2';
const STRANGER = '00000000-0000-0000-0000-0000000000a3';
const MON = '2026-10-12';
const NEXT_MON = '2026-10-19';
let db: PGlite;
let hh: string;
let papaId: string;
let sonId: string;

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];

describe('menu schema', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB') as id"))[0].id;
    papaId = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA]))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh]))[0].c;
    sonId = (await rows<{ id: string }>(SON, "select public.accept_invite($1, 'Сын', '#1FA463') as id", [code]))[0].id;
  });

  async function approvedWeek() {
    const w = (await rows<{ id: string }>(PAPA, "insert into public.weeks (household_id, starts_on, template_id, status, approved_by) values ($1, $2, 'autumn', 'approved', $3) returning id", [hh, MON, papaId]))[0].id;
    await asUser(db, PAPA, "insert into public.week_slots (week_id, household_id, day, meal, dish_id) values ($1, $2, 0, 'dinner', 'mn-kotlety')", [w, hh]);
    return w;
  }

  it('lets the family read a week a parent set', async () => {
    await approvedWeek();
    const seen = await rows<{ dish_id: string }>(SON, 'select dish_id from public.week_slots');
    expect(seen).toEqual([{ dish_id: 'mn-kotlety' }]);
  });

  it('lets a child propose next week but not approve it', async () => {
    const w = (await rows<{ id: string }>(SON, "insert into public.weeks (household_id, starts_on, template_id, status, proposed_by) values ($1, $2, 'quick', 'proposed', $3) returning id", [hh, NEXT_MON, sonId]))[0].id;
    await asUser(db, SON, "insert into public.week_slots (week_id, household_id, day, meal, dish_id) values ($1, $2, 1, 'breakfast', 'br-syrniki')", [w, hh]);
    await expect(asUser(db, SON, "update public.weeks set status = 'approved' where id = $1", [w])).rejects.toThrow(/not_a_parent/);
    await asUser(db, PAPA, "update public.weeks set status = 'approved', approved_by = $2 where id = $1", [w, papaId]);
    expect((await rows<{ status: string }>(SON, 'select status from public.weeks where id = $1', [w]))[0].status).toBe('approved');
  });

  it('keeps an approved week closed to a child', async () => {
    const w = await approvedWeek();
    await expect(asUser(db, SON, "update public.week_slots set dish_id = 'mn-plov' where week_id = $1 and day = 0 and meal = 'dinner'", [w])).rejects.toThrow(/not_a_parent/);
    await expect(asUser(db, SON, "insert into public.weeks (household_id, starts_on, status) values ($1, '2026-10-26', 'approved')", [hh])).rejects.toThrow(/not_a_parent/);
  });

  it('rejects a slot that points to another family', async () => {
    const w = await approvedWeek();
    await addUser(db, '00000000-0000-0000-0000-0000000000a4');
    const other = (await rows<{ id: string }>('00000000-0000-0000-0000-0000000000a4', "select public.create_household('Чужие', 'Кто-то', '#000000') as id"))[0].id;
    await expect(asUser(db, PAPA, "insert into public.week_slots (week_id, household_id, day, meal, dish_id) values ($1, $2, 1, 'dinner', 'mn-plov')", [w, other])).rejects.toThrow();
  });

  it('lets each member vote only as themselves', async () => {
    const w = await approvedWeek();
    await asUser(db, SON, "insert into public.votes (week_id, member_id, household_id, value) values ($1, $2, $3, 'yes')", [w, sonId, hh]);
    await expect(asUser(db, SON, "insert into public.votes (week_id, member_id, household_id, value) values ($1, $2, $3, 'yes')", [w, papaId, hh])).rejects.toThrow();
    expect(await rows(PAPA, 'select value from public.votes')).toEqual([{ value: 'yes' }]);
  });

  it('hides weeks from strangers', async () => {
    await approvedWeek();
    expect(await rows(STRANGER, 'select * from public.weeks')).toEqual([]);
    expect(await rows(STRANGER, 'select * from public.week_slots')).toEqual([]);
  });

  it('lets the family save its own template but not edit the base one', async () => {
    await asUser(db, PAPA, "insert into public.week_templates (id, household_id, name) values ('h-1', $1, 'Наша')", [hh]);
    await asUser(db, PAPA, "insert into public.template_slots (template_id, day, meal, dish_id) values ('h-1', 0, 'dinner', 'mn-plov')");
    await asUser(db, PAPA, "update public.week_templates set name = 'Сломали' where id = 'autumn'");
    expect((await rows<{ name: string }>(PAPA, "select name from public.week_templates where id = 'autumn'"))[0].name).toBe('Осенняя');
    expect((await rows<{ n: number }>(SON, "select count(*) as n from public.template_slots where template_id = 'h-1'"))[0].n).toBe(1);
  });

  it('moves updated_at forward on every change', async () => {
    const w = await approvedWeek();
    const before = (await rows<{ t: string }>(PAPA, 'select updated_at::text as t from public.week_slots where week_id = $1', [w]))[0].t;
    await new Promise((r) => setTimeout(r, 20));
    await asUser(db, PAPA, "update public.week_slots set dish_id = 'mn-plov' where week_id = $1", [w]);
    const after = (await rows<{ t: string }>(PAPA, 'select updated_at::text as t from public.week_slots where week_id = $1', [w]))[0].t;
    expect(after > before).toBe(true);
  });
});
```

Run: `npm test -- tests/db/menu.test.ts`
Expected: FAIL — `relation "public.weeks" does not exist`.

Ids `mn-kotlety`, `mn-plov`, `br-syrniki` и шаблон `autumn` берутся из засеянной базы (каркас, задача 9). Перед запуском проверить, что такие id есть:

```bash
grep -o "'mn-kotlety'\|'mn-plov'\|'br-syrniki'" supabase/migrations/20261014000400_seed_content.sql | sort -u
```

Если какого-то нет, взять любой существующий id той же категории и подставить в тест.

- [ ] **Step 2: Миграция**

`supabase/migrations/20261014000500_menu.sql`:

```sql
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  starts_on date not null check (extract(isodow from starts_on) = 1),
  template_id text references public.week_templates (id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'approved')),
  proposed_by uuid references public.members (id) on delete set null,
  approved_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, starts_on)
);

create table public.week_slots (
  week_id uuid not null references public.weeks (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  meal text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  dish_id text references public.recipes (id), side_id text references public.recipes (id), salad_id text references public.recipes (id),
  simple jsonb,
  updated_at timestamptz not null default now(),
  primary key (week_id, day, meal)
);

create table public.votes (
  week_id uuid not null references public.weeks (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  value text not null check (value in ('yes', 'changes')),
  comment text not null default '',
  updated_at timestamptz not null default now(),
  primary key (week_id, member_id)
);

alter table public.template_slots add column updated_at timestamptz not null default now();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  -- clock_timestamp keeps several changes in one transaction ordered.
  new.updated_at = clock_timestamp();
  return new;
end $$;
create trigger weeks_touch before insert or update on public.weeks for each row execute function public.touch_updated_at();
create trigger week_slots_touch before insert or update on public.week_slots for each row execute function public.touch_updated_at();
create trigger votes_touch before insert or update on public.votes for each row execute function public.touch_updated_at();
create trigger week_templates_touch before insert or update on public.week_templates for each row execute function public.touch_updated_at();
create trigger template_slots_touch before insert or update on public.template_slots for each row execute function public.touch_updated_at();

create function public.guard_week_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent(new.household_id) then
    if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then raise exception 'not_a_parent'; end if;
    if tg_op = 'UPDATE' and old.status = 'approved' then raise exception 'not_a_parent'; end if;
  end if;
  return new;
end $$;
create trigger weeks_guard before insert or update on public.weeks for each row execute function public.guard_week_status();

create function public.guard_slot_change() returns trigger language plpgsql security definer set search_path = public as $$
declare w public.weeks;
begin
  select * into w from public.weeks where id = new.week_id;
  if w.household_id is distinct from new.household_id then raise exception 'wrong_household'; end if;
  if w.status = 'approved' and not public.is_parent(new.household_id) then raise exception 'not_a_parent'; end if;
  return new;
end $$;
create trigger week_slots_guard before insert or update on public.week_slots for each row execute function public.guard_slot_change();

alter table public.weeks enable row level security;
alter table public.week_slots enable row level security;
alter table public.votes enable row level security;

create policy "family reads weeks" on public.weeks for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds weeks" on public.weeks for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits weeks" on public.weeks for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads slots" on public.week_slots for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds slots" on public.week_slots for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits slots" on public.week_slots for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads votes" on public.votes for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "members vote as themselves" on public.votes for insert to authenticated
  with check (household_id in (select public.my_household_ids()) and member_id in (select id from public.members where user_id = auth.uid()));
create policy "members change their own vote" on public.votes for update to authenticated
  using (member_id in (select id from public.members where user_id = auth.uid()))
  with check (member_id in (select id from public.members where user_id = auth.uid()));

grant select, insert, update on public.weeks, public.week_slots, public.votes to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.weeks, public.week_slots, public.votes;
  end if;
end $$;
```

- [ ] **Step 3: Тесты проходят**

Run: `npm test -- tests/db`
Expected: PASS — все тесты базы, в том числе menu (8).

- [ ] **Step 4: Выложить и закоммитить**

```bash
npx --yes supabase@2 db push --yes
git add supabase/migrations app/tests/db && git commit -m "feat: add weeks, slots and votes with parent-only approval" && git push origin main
```

Expected: «Applying migration 20261014000500_menu.sql… Finished supabase db push.»

---

### Task 2: Неделя по местному времени и кастрюли супа

**Files:**
- Create: `app/src/features/menu/week.ts`, `app/src/features/menu/week.test.ts`

**Interfaces:**
- Produces:
  - `type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner'`;
  - `MEALS: Meal[]`, `MEAL_LABEL: Record<Meal, string>`, `MEAL_TIME: Record<Meal, string>`;
  - `mondayOf(d: Date): string` — `YYYY-MM-DD` по местному времени;
  - `addDaysIso(iso: string, n: number): string`;
  - `dayOfWeek(d: Date): number` — 0 понедельник;
  - `weekLabel(startIso: string): string`;
  - `type SlotLike = { day: number; meal: Meal; dish_id: string | null }`;
  - `soupBatches(slots: SlotLike[]): Array<{ dish_id: string; from: number; to: number }>`;
  - `soupOn(slots: SlotLike[], day: number): { dish_id: string; nth: number; of: number } | null`;
  - `fitsMeal(r: { category: string; meals: string[] }, meal: Meal): boolean`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/menu/week.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDaysIso, dayOfWeek, fitsMeal, mondayOf, soupBatches, soupOn, weekLabel, type SlotLike } from './week';

describe('week dates', () => {
  it('takes Monday in local time on a late Sunday evening', () => {
    expect(mondayOf(new Date(2026, 9, 18, 23, 30))).toBe('2026-10-12');
  });
  it('starts a new week right after Sunday midnight', () => {
    expect(mondayOf(new Date(2026, 9, 19, 0, 30))).toBe('2026-10-19');
  });
  it('counts days from Monday', () => {
    expect(dayOfWeek(new Date(2026, 9, 13))).toBe(1);
    expect(dayOfWeek(new Date(2026, 9, 18))).toBe(6);
  });
  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-10-26', 6)).toBe('2026-11-01');
  });
  it('labels a week inside one month and across two', () => {
    expect(weekLabel('2026-10-12')).toBe('12–18 октября');
    expect(weekLabel('2026-10-26')).toBe('26 октября – 1 ноября');
  });
});

describe('soup pots', () => {
  const lunch = (day: number, dish: string | null): SlotLike => ({ day, meal: 'lunch', dish_id: dish });
  const slots = [lunch(0, 'sp-borsch'), lunch(1, 'sp-borsch'), lunch(2, 'sp-borsch'), lunch(3, 'sp-ukha'), lunch(4, 'sp-ukha'), lunch(5, null), lunch(6, 'sp-borsch'),
    { day: 0, meal: 'dinner', dish_id: 'sp-borsch' } as SlotLike];

  it('groups consecutive days with the same soup into one pot', () => {
    expect(soupBatches(slots)).toEqual([
      { dish_id: 'sp-borsch', from: 0, to: 2 },
      { dish_id: 'sp-ukha', from: 3, to: 4 },
      { dish_id: 'sp-borsch', from: 6, to: 6 },
    ]);
  });
  it('tells which day of the pot it is', () => {
    expect(soupOn(slots, 1)).toEqual({ dish_id: 'sp-borsch', nth: 2, of: 3 });
    expect(soupOn(slots, 5)).toBeNull();
  });
});

describe('fitsMeal', () => {
  it('matches dishes to meals', () => {
    expect(fitsMeal({ category: 'main', meals: ['dinner'] }, 'dinner')).toBe(true);
    expect(fitsMeal({ category: 'soup', meals: ['lunch'] }, 'lunch')).toBe(true);
    expect(fitsMeal({ category: 'dessert', meals: ['snack'] }, 'snack')).toBe(true);
    expect(fitsMeal({ category: 'breakfast', meals: ['breakfast'] }, 'dinner')).toBe(false);
    expect(fitsMeal({ category: 'main', meals: ['breakfast', 'dinner'] }, 'breakfast')).toBe(true);
  });
});
```

Run: `npm test -- src/features/menu/week.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Реализация**

`app/src/features/menu/week.ts`:

```ts
export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner'];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Завтрак', lunch: 'Обед', snack: 'Полдник', dinner: 'Ужин' };
export const MEAL_TIME: Record<Meal, string> = { breakfast: '08:00', lunch: '13:00', snack: '16:30', dinner: '19:00' };
export type SlotLike = { day: number; meal: Meal; dish_id: string | null };

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export const dayOfWeek = (d: Date) => (d.getDay() + 6) % 7;

export function mondayOf(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - dayOfWeek(m));
  return iso(m);
}

export function addDaysIso(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function weekLabel(start: string): string {
  const a = parse(start);
  const b = parse(addDaysIso(start, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

export function soupBatches(slots: SlotLike[]): Array<{ dish_id: string; from: number; to: number }> {
  const byDay = new Map<number, string | null>();
  slots.filter((s) => s.meal === 'lunch').forEach((s) => byDay.set(s.day, s.dish_id));
  const out: Array<{ dish_id: string; from: number; to: number }> = [];
  for (let d = 0; d < 7; d += 1) {
    const id = byDay.get(d) ?? null;
    const last = out[out.length - 1];
    if (!id) continue;
    if (last && last.dish_id === id && last.to === d - 1) last.to = d;
    else out.push({ dish_id: id, from: d, to: d });
  }
  return out;
}

export function soupOn(slots: SlotLike[], day: number) {
  const b = soupBatches(slots).find((x) => day >= x.from && day <= x.to);
  return b ? { dish_id: b.dish_id, nth: day - b.from + 1, of: b.to - b.from + 1 } : null;
}

export function fitsMeal(r: { category: string; meals: string[] }, meal: Meal): boolean {
  if (meal === 'lunch') return r.category === 'soup';
  if (meal === 'dinner') return r.category === 'main';
  if (meal === 'snack') return ['snack', 'dessert', 'drink'].includes(r.category) || r.meals.includes('snack');
  return r.category === 'breakfast' || r.meals.includes('breakfast');
}
```

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test -- src/features/menu/week.test.ts`
Expected: PASS, 8 tests.

```bash
git add app/src/features/menu && git commit -m "feat: add local-time week dates and soup pots" && git push origin main
```

---

### Task 3: Локальная база на телефоне

**Files:**
- Create: `app/src/data/db.ts`, `app/src/data/db.test.ts`
- Modify: `app/package.json` (dexie, dexie-react-hooks, fake-indexeddb)

**Interfaces:**
- Produces:
  - типы строк `Recipe`, `RecipeIngredient`, `RecipeSide`, `Ingredient`, `Price`, `WeekTemplate`, `TemplateSlot`, `Week`, `WeekSlot`, `Vote`, `OutboxOp`, `SyncTable`;
  - `class LocalDb extends Dexie`;
  - `createLocalDb(name?: string): LocalDb`;
  - `localDb` — общий экземпляр приложения;
  - `slotKey(table: SyncTable, row): string`.

- [ ] **Step 1: Зависимости**

```bash
npm -w app install dexie@4 dexie-react-hooks@4
npm -w app install -D fake-indexeddb@6
```

- [ ] **Step 2: Падающий тест**

`app/src/data/db.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, slotKey } from './db';

describe('local db', () => {
  it('finds a week by family and Monday', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.weeks.put({ id: 'w1', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: null, updated_at: '2026-10-12T08:00:00Z', deleted_at: null });
    const w = await db.weeks.where('[household_id+starts_on]').equals(['h1', '2026-10-12']).first();
    expect(w?.id).toBe('w1');
  });

  it('keeps the outbox in the order of writes', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.outbox.add({ table: 'week_slots', row: { week_id: 'w1', day: 0, meal: 'dinner' }, created_at: 'a', tries: 0 });
    await db.outbox.add({ table: 'votes', row: { week_id: 'w1', member_id: 'm1' }, created_at: 'b', tries: 0 });
    expect((await db.outbox.orderBy('seq').toArray()).map((o) => o.table)).toEqual(['week_slots', 'votes']);
  });

  it('builds stable keys for every synced table', () => {
    expect(slotKey('week_slots', { week_id: 'w', day: 2, meal: 'lunch' })).toBe('w|2|lunch');
    expect(slotKey('votes', { week_id: 'w', member_id: 'm' })).toBe('w|m');
    expect(slotKey('weeks', { id: 'w' })).toBe('w');
    expect(slotKey('template_slots', { template_id: 't', day: 0, meal: 'snack' })).toBe('t|0|snack');
  });
});
```

Run: `npm test -- src/data/db.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`app/src/data/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';
import type { Meal } from '../features/menu/week';

export type Recipe = {
  id: string; household_id: string | null; name: string; about: string; category: string; meals: string[];
  time_active: number; time_total: number; servings: number; keeps_days: number; protein: string; tags: string[];
  season: string[]; collections: string[]; dima_level: 'ok' | 'adapt' | 'skip'; dima_note: string; steps: string[];
  source_url: string | null; source_site: string | null; updated_at: string; deleted_at: string | null;
};
export type RecipeIngredient = { recipe_id: string; pos: number; item: string; qty: number | null; to_taste: boolean; note: string; optional: boolean };
export type RecipeSide = { recipe_id: string; side_id: string };
export type Ingredient = { item: string; unit: string; dept: string; grp: string; piece_weight: number | null; piece_name: string | null; pantry: boolean };
export type Price = { item: string; price_per_unit: number; source: string; note: string | null; collected: string };
export type SimpleSnack = { simple: string; items: Array<{ item: string; qty: number }> };
export type WeekTemplate = { id: string; household_id: string | null; name: string; season: string[]; note: string; updated_at: string; deleted_at: string | null };
export type TemplateSlot = { template_id: string; day: number; meal: Meal; dish_id: string | null; side_id: string | null; salad_id: string | null; simple: SimpleSnack | null; updated_at: string };
export type Week = { id: string; household_id: string; starts_on: string; template_id: string | null; status: 'proposed' | 'approved'; proposed_by: string | null; approved_by: string | null; updated_at: string; deleted_at: string | null };
export type WeekSlot = { week_id: string; household_id: string; day: number; meal: Meal; dish_id: string | null; side_id: string | null; salad_id: string | null; simple: SimpleSnack | null; updated_at: string };
export type Vote = { week_id: string; member_id: string; household_id: string; value: 'yes' | 'changes'; comment: string; updated_at: string };
export type SyncTable = 'weeks' | 'week_slots' | 'votes' | 'week_templates' | 'template_slots';
export type OutboxOp = { seq?: number; table: SyncTable; row: Record<string, unknown>; created_at: string; tries: number };
export type Meta = { key: string; value: unknown };

export const KEY_FIELDS: Record<SyncTable, string[]> = {
  weeks: ['id'],
  week_slots: ['week_id', 'day', 'meal'],
  votes: ['week_id', 'member_id'],
  week_templates: ['id'],
  template_slots: ['template_id', 'day', 'meal'],
};

export const slotKey = (table: SyncTable, row: Record<string, unknown>) => KEY_FIELDS[table].map((k) => String(row[k])).join('|');

export class LocalDb extends Dexie {
  recipes!: Table<Recipe, string>;
  recipe_ingredients!: Table<RecipeIngredient, [string, number]>;
  recipe_sides!: Table<RecipeSide, [string, string]>;
  ingredients!: Table<Ingredient, string>;
  prices!: Table<Price, string>;
  week_templates!: Table<WeekTemplate, string>;
  template_slots!: Table<TemplateSlot, [string, number, string]>;
  weeks!: Table<Week, string>;
  week_slots!: Table<WeekSlot, [string, number, string]>;
  votes!: Table<Vote, [string, string]>;
  outbox!: Table<OutboxOp, number>;
  meta!: Table<Meta, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
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
    });
  }
}

export const createLocalDb = (name = 'family-app') => new LocalDb(name);
export const localDb = createLocalDb();
```

- [ ] **Step 4: Тесты проходят, коммит**

Run: `npm test -- src/data/db.test.ts`
Expected: PASS, 3 tests.

```bash
git add app && git commit -m "feat: add the local IndexedDB store for offline use" && git push origin main
```

---

### Task 4: Запись без сети и синхронизация

**Files:**
- Create: `app/src/data/sync.ts`, `app/src/data/sync.test.ts`, `app/src/data/fakeSupabase.ts`

**Interfaces:**
- Consumes: `LocalDb`, `SyncTable`, `KEY_FIELDS`, `slotKey` (задача 3).
- Produces:
  - `writeLocal(db, table: SyncTable, rows: Record<string, unknown>[]): Promise<void>` — пишет строки в локальную таблицу и в `outbox` одной транзакцией;
  - `pushOutbox(db, client): Promise<{ pushed: number; stopped: 'network' | null; rejected: string[] }>`;
  - `pullTable(db, client, table: SyncTable): Promise<number>`;
  - `syncNow(db, client): Promise<{ pushed: number; pulled: number; offline: boolean; rejected: string[] }>`;
  - `pendingCount(db): Promise<number>`;
  - `rejectionText(message: string): string`;
  - `fakeSupabase(tables)` — минимальная подмена клиента для тестов: `from().upsert()`, `select().gt().order().range()`, `select().eq()...`, переключатели `offline` и `reject(table, message)`.

- [ ] **Step 1: Подмена клиента для тестов**

`app/src/data/fakeSupabase.ts`:

```ts
// Test double for the few supabase-js calls the sync engine makes.
type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

export function fakeSupabase(store: Store, keyFields: Record<string, string[]>) {
  const state = { offline: false, rejects: new Map<string, string>(), clock: 1 };
  const key = (t: string, r: Row) => keyFields[t].map((k) => String(r[k])).join('|');
  const stamp = () => new Date(Date.UTC(2026, 9, 14, 0, 0, state.clock++)).toISOString();
  const failNet = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };

  function from(table: string) {
    store[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    let order: string | null = null;
    let range: [number, number] | null = null;
    const exec = () => {
      if (state.offline) return failNet;
      let rows = store[table].filter((r) => filters.every((f) => f(r)));
      if (order) rows = [...rows].sort((a, b) => String(a[order!]).localeCompare(String(b[order!])));
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: rows.map((r) => ({ ...r })), error: null };
    };
    const q = {
      select: () => q,
      gt: (c: string, v: string) => { filters.push((r) => String(r[c]) > v); return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      order: (c: string) => { order = c; return q; },
      range: (a: number, b: number) => { range = [a, b]; return q; },
      maybeSingle: () => Promise.resolve(((r) => (r.error ? r : { data: r.data?.[0] ?? null, error: null }))(exec())),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
      upsert: (rows: Row | Row[]) => {
        if (state.offline) return Promise.resolve(failNet);
        const reject = state.rejects.get(table);
        if (reject) return Promise.resolve({ data: null, error: { message: reject, code: 'P0001' } });
        for (const r of Array.isArray(rows) ? rows : [rows]) {
          const k = key(table, r);
          const i = store[table].findIndex((x) => key(table, x) === k);
          const next = { ...(i >= 0 ? store[table][i] : {}), ...r, updated_at: stamp() };
          if (i >= 0) store[table][i] = next; else store[table].push(next);
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return q;
  }

  return {
    client: { from } as unknown,
    setOffline(v: boolean) { state.offline = v; },
    reject(table: string, message: string) { state.rejects.set(table, message); },
    serverRow(table: string, r: Row) { store[table] ??= []; store[table].push({ ...r, updated_at: stamp() }); },
  };
}
```

- [ ] **Step 2: Падающие тесты**

`app/src/data/sync.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { pendingCount, pullTable, pushOutbox, rejectionText, syncNow, writeLocal } from './sync';

const slot = (dish: string) => ({ week_id: 'w1', household_id: 'h1', day: 1, meal: 'dinner', dish_id: dish, side_id: null, salad_id: null, simple: null });

describe('sync', () => {
  it('keeps a change made offline and sends it when the network is back', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.setOffline(true);
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-plov');
    expect((await syncNow(db, fake.client as never)).offline).toBe(true);
    expect(await pendingCount(db)).toBe(1);

    const reopened = createLocalDb(db.name);
    expect(await pendingCount(reopened)).toBe(1);

    fake.setOffline(false);
    const r = await syncNow(reopened, fake.client as never);
    expect(r.pushed).toBe(1);
    expect(await pendingCount(reopened)).toBe(0);
  });

  it('pulls rows changed on another phone and moves the cursor', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.serverRow('week_slots', slot('mn-kotlety'));
    expect(await pullTable(db, fake.client as never, 'week_slots')).toBe(1);
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-kotlety');
    expect(await pullTable(db, fake.client as never, 'week_slots')).toBe(0);
  });

  it('does not overwrite a change still waiting to be sent', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.setOffline(true);
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    fake.setOffline(false);
    fake.serverRow('week_slots', slot('mn-kotlety'));
    await pullTable(db, fake.client as never, 'week_slots');
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-plov');
  });

  it('rolls a refused change back to the server version and explains why', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.serverRow('week_slots', slot('mn-kotlety'));
    await pullTable(db, fake.client as never, 'week_slots');
    fake.reject('week_slots', 'not_a_parent');
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    const r = await pushOutbox(db, fake.client as never);
    expect(r.rejected).toEqual(['not_a_parent']);
    expect(await pendingCount(db)).toBe(0);
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-kotlety');
    expect(rejectionText('not_a_parent')).toBe('Менять утверждённую неделю могут только родители. Вернули как было.');
  });

  it('pages through large tables', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    for (let i = 0; i < 2300; i += 1) fake.serverRow('week_templates', { id: `t${i}`, household_id: null, name: `T${i}`, season: ['any'], note: '', deleted_at: null });
    expect(await pullTable(db, fake.client as never, 'week_templates')).toBe(2300);
    expect(await db.week_templates.count()).toBe(2300);
  });
});
```

Run: `npm test -- src/data/sync.test.ts`
Expected: FAIL — модуль `./sync` не найден.

- [ ] **Step 3: Реализация**

`app/src/data/sync.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { KEY_FIELDS, slotKey, type LocalDb, type SyncTable } from './db';

type Row = Record<string, unknown>;
type Client = Pick<SupabaseClient, 'from'>;
const PAGE = 1000;
const TABLES: SyncTable[] = ['week_templates', 'template_slots', 'weeks', 'week_slots', 'votes'];

const isNetwork = (message: string) => /fetch|network|timeout|load failed/i.test(message);
const tableOf = (db: LocalDb, t: SyncTable) => db.table(t);
const keyArray = (t: SyncTable, row: Row) => {
  const k = KEY_FIELDS[t].map((f) => row[f]);
  return k.length === 1 ? k[0] : k;
};

export async function writeLocal(db: LocalDb, table: SyncTable, rows: Row[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [tableOf(db, table), db.outbox], async () => {
    for (const row of rows) {
      await tableOf(db, table).put({ ...row, updated_at: now });
      await db.outbox.add({ table, row, created_at: now, tries: 0 });
    }
  });
}

export const pendingCount = (db: LocalDb) => db.outbox.count();

const REJECT_TEXT: Record<string, string> = {
  not_a_parent: 'Менять утверждённую неделю могут только родители. Вернули как было.',
  wrong_household: 'Это изменение относится к другой семье. Вернули как было.',
};

export function rejectionText(message: string): string {
  const key = Object.keys(REJECT_TEXT).find((k) => message.includes(k));
  return key ? REJECT_TEXT[key] : 'Сервер не принял изменение. Вернули как было.';
}

async function restoreFromServer(db: LocalDb, client: Client, table: SyncTable, row: Row) {
  let q = client.from(table).select('*') as unknown as { eq: (c: string, v: unknown) => typeof q; maybeSingle: () => Promise<{ data: Row | null; error: unknown }> };
  for (const f of KEY_FIELDS[table]) q = q.eq(f, row[f]);
  const { data, error } = await q.maybeSingle();
  if (error) return;
  if (data) await tableOf(db, table).put(data);
  else await tableOf(db, table).delete(keyArray(table, row) as never);
}

export async function pushOutbox(db: LocalDb, client: Client) {
  const rejected: string[] = [];
  let pushed = 0;
  for (const op of await db.outbox.orderBy('seq').toArray()) {
    const { error } = await client.from(op.table).upsert(op.row, { onConflict: KEY_FIELDS[op.table].join(',') });
    if (error && isNetwork(error.message)) {
      await db.outbox.update(op.seq!, { tries: op.tries + 1 });
      return { pushed, stopped: 'network' as const, rejected };
    }
    await db.outbox.delete(op.seq!);
    if (error) {
      rejected.push(error.message);
      // A later queued write for the same row would be refused for the same reason.
      const key = slotKey(op.table, op.row);
      for (const later of await db.outbox.where('table').equals(op.table).toArray()) {
        if (slotKey(later.table, later.row) === key) await db.outbox.delete(later.seq!);
      }
      await restoreFromServer(db, client, op.table, op.row);
    } else pushed += 1;
  }
  return { pushed, stopped: null, rejected };
}

export async function pullTable(db: LocalDb, client: Client, table: SyncTable): Promise<number> {
  const cursorKey = `cursor:${table}`;
  let cursor = ((await db.meta.get(cursorKey))?.value as string | undefined) ?? '1970-01-01T00:00:00Z';
  const pending = new Set((await db.outbox.where('table').equals(table).toArray()).map((o) => slotKey(table, o.row)));
  let total = 0;
  for (;;) {
    const { data, error } = await (client.from(table).select('*').gt('updated_at', cursor).order('updated_at').range(0, PAGE - 1) as unknown as Promise<{ data: Row[] | null; error: { message: string } | null }>);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const fresh = rows.filter((r) => !pending.has(slotKey(table, r)));
    if (fresh.length) await tableOf(db, table).bulkPut(fresh);
    total += rows.length;
    if (rows.length) cursor = String(rows[rows.length - 1].updated_at);
    await db.meta.put({ key: cursorKey, value: cursor });
    if (rows.length < PAGE) return total;
  }
}

export async function syncNow(db: LocalDb, client: Client) {
  const push = await pushOutbox(db, client);
  if (push.stopped === 'network') return { pushed: push.pushed, pulled: 0, offline: true, rejected: push.rejected };
  let pulled = 0;
  try {
    for (const t of TABLES) pulled += await pullTable(db, client, t);
  } catch (e) {
    if (isNetwork((e as Error).message)) return { pushed: push.pushed, pulled, offline: true, rejected: push.rejected };
    throw e;
  }
  await db.meta.put({ key: 'synced_at', value: new Date().toISOString() });
  return { pushed: push.pushed, pulled, offline: false, rejected: push.rejected };
}
```

- [ ] **Step 4: Тесты проходят, коммит**

Run: `npm test -- src/data`
Expected: PASS — db (3), sync (5).

```bash
git add app/src/data && git commit -m "feat: add the offline outbox and two-way sync" && git push origin main
```

---

### Task 5: База рецептов в телефоне

**Files:**
- Create: `app/src/data/content.ts`, `app/src/data/content.test.ts`
- Modify: `app/src/data/fakeSupabase.ts` (без изменений интерфейса)

**Interfaces:**
- Consumes: `LocalDb`, `fakeSupabase` (задачи 3–4).
- Produces:
  - `loadContent(db, client, { force?: boolean; now?: Date }): Promise<{ loaded: boolean; counts: Record<string, number> }>` — забирает страницами `ingredients`, `prices`, `recipes`, `recipe_ingredients`, `recipe_sides`;
  - базовые шаблоны недель приходят через `pullTable` (задача 4);
  - повторная загрузка — не чаще раза в 7 дней, если не `force`.

- [ ] **Step 1: Падающий тест**

`app/src/data/content.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { loadContent } from './content';

function server() {
  const store: Record<string, Record<string, unknown>[]> = {
    ingredients: [{ item: 'морковь', unit: 'г', dept: 'Овощи и фрукты', grp: 'veg', piece_weight: 100, piece_name: null, pantry: false }],
    prices: [{ item: 'морковь', price_per_unit: 0.035, source: 'Магнит, Краснодар', note: null, collected: '2026-10-13' }],
    recipes: Array.from({ length: 229 }, (_, i) => ({ id: `r${i}`, name: `Блюдо ${i}`, category: 'main', meals: ['dinner'] })),
    recipe_ingredients: Array.from({ length: 2400 }, (_, i) => ({ recipe_id: `r${i % 229}`, pos: Math.floor(i / 229), item: 'морковь', qty: 100 })),
    recipe_sides: [{ recipe_id: 'r0', side_id: 'r1' }],
  };
  return fakeSupabase(store, { ...KEY_FIELDS, ingredients: ['item'], prices: ['item'], recipes: ['id'], recipe_ingredients: ['recipe_id', 'pos'], recipe_sides: ['recipe_id', 'side_id'] });
}

describe('loadContent', () => {
  it('loads every page of the recipe base', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const r = await loadContent(db, server().client as never, { now: new Date('2026-10-14T00:00:00Z') });
    expect(r.loaded).toBe(true);
    expect(await db.recipes.count()).toBe(229);
    expect(await db.recipe_ingredients.count()).toBe(2400);
    expect(await db.prices.count()).toBe(1);
  });

  it('skips a fresh copy and reloads a week-old one', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = server();
    await loadContent(db, fake.client as never, { now: new Date('2026-10-14T00:00:00Z') });
    expect((await loadContent(db, fake.client as never, { now: new Date('2026-10-15T00:00:00Z') })).loaded).toBe(false);
    expect((await loadContent(db, fake.client as never, { now: new Date('2026-10-22T00:00:00Z') })).loaded).toBe(true);
  });

  it('keeps the old copy when the network is down', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = server();
    await loadContent(db, fake.client as never, { now: new Date('2026-10-14T00:00:00Z') });
    fake.setOffline(true);
    const r = await loadContent(db, fake.client as never, { force: true, now: new Date('2026-10-22T00:00:00Z') });
    expect(r.loaded).toBe(false);
    expect(await db.recipes.count()).toBe(229);
  });
});
```

Run: `npm test -- src/data/content.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Реализация**

`app/src/data/content.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalDb } from './db';

type Client = Pick<SupabaseClient, 'from'>;
type Row = Record<string, unknown>;
const PAGE = 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const TABLES = [
  { name: 'ingredients', order: 'item' },
  { name: 'prices', order: 'item' },
  { name: 'recipes', order: 'id' },
  { name: 'recipe_ingredients', order: 'recipe_id' },
  { name: 'recipe_sides', order: 'recipe_id' },
] as const;

async function fetchAll(client: Client, table: string, order: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (client.from(table).select('*').order(order).range(from, from + PAGE - 1) as unknown as Promise<{ data: Row[] | null; error: { message: string } | null }>);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadContent(db: LocalDb, client: Client, opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const at = (await db.meta.get('content_loaded_at'))?.value as string | undefined;
  if (!opts.force && at && now.getTime() - new Date(at).getTime() < WEEK_MS) return { loaded: false, counts: {} };
  let fetched: Record<string, Row[]>;
  try {
    fetched = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t.name, await fetchAll(client, t.name, t.order)] as const)));
  } catch {
    // Offline or blocked: keep the copy the phone already has.
    return { loaded: false, counts: {} };
  }
  await db.transaction('rw', TABLES.map((t) => db.table(t.name)).concat(db.meta), async () => {
    for (const t of TABLES) {
      await db.table(t.name).clear();
      await db.table(t.name).bulkPut(fetched[t.name]);
    }
    await db.meta.put({ key: 'content_loaded_at', value: now.toISOString() });
  });
  return { loaded: true, counts: Object.fromEntries(TABLES.map((t) => [t.name, fetched[t.name].length])) };
}
```

`fakeSupabase` уже поддерживает `select().order().range()`. Порядок по строковому полю нужен только для стабильных страниц.

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test -- src/data`
Expected: PASS — db (3), sync (5), content (3).

```bash
git add app/src/data && git commit -m "feat: cache the recipe base on the phone with paged loading" && git push origin main
```

---

### Task 6: Синхронизация в приложении

**Files:**
- Create: `app/src/data/SyncProvider.tsx`, `app/src/data/SyncProvider.test.tsx`
- Modify: `app/src/app/App.tsx` (обернуть оболочку для участника семьи)

**Interfaces:**
- Consumes: `localDb`, `syncNow`, `loadContent`, `pendingCount`, `rejectionText`, `supabase`.
- Produces:
  - `SyncProvider({ householdId, children, client?, db? })`. Запускает `loadContent` и `syncNow` при монтировании, при событии `online`, раз в 60 секунд при видимой вкладке и по Realtime-событиям таблиц `weeks`, `week_slots`, `votes` своей семьи.
  - `useSync(): { syncing: boolean; offline: boolean; pending: number; syncedAt: string | null; message: string; syncNow(): Promise<void> }`.

- [ ] **Step 1: Падающий тест**

`app/src/data/SyncProvider.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { SyncProvider, useSync } from './SyncProvider';
import { writeLocal } from './sync';

function Probe() {
  const s = useSync();
  return <p>{s.offline ? 'offline' : 'online'} · {s.pending}</p>;
}

describe('SyncProvider', () => {
  it('sends queued changes when the browser comes back online', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.setOffline(true);
    await writeLocal(db, 'votes', [{ week_id: 'w1', member_id: 'm1', household_id: 'h1', value: 'yes', comment: '' }]);
    const client = Object.assign(fake.client as object, { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} });
    render(<SyncProvider householdId="h1" client={client as never} db={db}><Probe /></SyncProvider>);
    await waitFor(() => expect(screen.getByText('offline · 1')).toBeInTheDocument());
    fake.setOffline(false);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByText('online · 0')).toBeInTheDocument());
  });
});
```

Run: `npm test -- src/data/SyncProvider.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Реализация**

`app/src/data/SyncProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { localDb, type LocalDb } from './db';
import { loadContent } from './content';
import { pendingCount, rejectionText, syncNow } from './sync';

type SyncState = { syncing: boolean; offline: boolean; pending: number; syncedAt: string | null; message: string };
type Ctx = SyncState & { syncNow: () => Promise<void> };
const SyncContext = createContext<Ctx>({ syncing: false, offline: false, pending: 0, syncedAt: null, message: '', syncNow: async () => {} });
export const useSync = () => useContext(SyncContext);

export function SyncProvider({ householdId, children, client = supabase, db = localDb }: { householdId: string; children: ReactNode; client?: SupabaseClient; db?: LocalDb }) {
  const [state, setState] = useState<SyncState>({ syncing: false, offline: false, pending: 0, syncedAt: null, message: '' });
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState((s) => ({ ...s, syncing: true }));
    try {
      await loadContent(db, client);
      const r = await syncNow(db, client);
      const syncedAt = ((await db.meta.get('synced_at'))?.value as string | undefined) ?? null;
      setState({ syncing: false, offline: r.offline, pending: await pendingCount(db), syncedAt, message: r.rejected.length ? rejectionText(r.rejected[0]) : '' });
    } catch {
      setState((s) => ({ ...s, syncing: false }));
    } finally {
      running.current = false;
    }
  }, [client, db]);

  useEffect(() => {
    run();
    const onOnline = () => { run(); };
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60_000);
    const channel = client.channel(`family-${householdId}`);
    for (const table of ['weeks', 'week_slots', 'votes']) {
      channel.on('postgres_changes' as never, { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` } as never, () => { run(); });
    }
    channel.subscribe();
    return () => { window.removeEventListener('online', onOnline); window.clearInterval(timer); client.removeChannel(channel); };
  }, [client, householdId, run]);

  return <SyncContext.Provider value={{ ...state, syncNow: run }}>{children}</SyncContext.Provider>;
}
```

`fakeSupabase` не умеет `channel`/`removeChannel`. Тест подмешивает их сам (шаг 1), сам фейк не меняется.

В `App.tsx` ветку участника семьи обернуть: `<SyncProvider householdId={me.household_id}>…</SyncProvider>`.

- [ ] **Step 3: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, включая SyncProvider (1).

```bash
git add app/src && git commit -m "feat: run sync on start, on reconnect, every minute and on realtime events" && git push origin main
```

---

### Task 7: Экран Меню: неделя и день

**Files:**
- Create: `app/src/features/menu/useMenu.ts`, `app/src/features/menu/MenuPage.tsx`, `app/src/features/menu/MealRow.tsx`, `app/src/features/menu/MenuPage.test.tsx`, `app/src/features/menu/testData.ts`
- Modify: `app/src/app/App.tsx` (маршрут `/menu`)

**Interfaces:**
- Consumes: `localDb`, `Week`, `WeekSlot`, `Recipe`, `WeekTemplate` (задача 3), `mondayOf`, `addDaysIso`, `weekLabel`, `dayOfWeek`, `soupBatches`, `soupOn`, `MEALS`, `MEAL_LABEL`, `MEAL_TIME` (задача 2), `Member` (каркас).
- Produces:
  - `useMenu(db, householdId, today: Date)` возвращает:
    - `{ current: { start, week, slots }, next: { start, week, slots, votes }, recipes: Map<string, Recipe>, templates: WeekTemplate[] }`;
    - `undefined`, пока Dexie читает;
  - `MenuPage({ me, members, db?, today? })` — экран; в тестах подменяются `db` и `today`;
  - `MealRow({ name, label, time, extra, note, onOpen })`;
  - `seedMenu(db)` в `testData.ts` — общий набор данных для тестов задач 7–9.

- [ ] **Step 1: Данные для тестов**

`app/src/features/menu/testData.ts`:

```ts
import type { LocalDb, Recipe, TemplateSlot, WeekSlot } from '../../data/db';
import type { Meal } from './week';

const recipe = (id: string, name: string, category: string, meals: string[], extra: Partial<Recipe> = {}): Recipe => ({
  id, household_id: null, name, about: '', category, meals, time_active: 10, time_total: 30, servings: 4, keeps_days: 1, protein: 'none',
  tags: ['будни'], season: ['any'], collections: [], dima_level: 'ok', dima_note: '', steps: ['Приготовить.'], source_url: null, source_site: null,
  updated_at: '2026-10-13T00:00:00Z', deleted_at: null, ...extra,
});

export const RECIPES = [
  recipe('br-syrniki', 'Сырники', 'breakfast', ['breakfast']),
  recipe('br-kasha', 'Овсяная каша', 'breakfast', ['breakfast']),
  recipe('sp-borsch', 'Борщ', 'soup', ['lunch'], { dima_level: 'adapt', dima_note: 'отложить до зажарки' }),
  recipe('sp-ukha', 'Уха', 'soup', ['lunch']),
  recipe('sn-yabloki', 'Печёные яблоки', 'snack', ['snack']),
  recipe('mn-kotlety', 'Котлеты', 'main', ['dinner']),
  recipe('mn-plov', 'Плов', 'main', ['dinner']),
  recipe('side-grechka', 'Гречка', 'side', ['dinner']),
];

export function templateDays(id: string, dinner: string, soup: string): TemplateSlot[] {
  const out: TemplateSlot[] = [];
  for (let day = 0; day < 7; day += 1) {
    const add = (meal: Meal, dish_id: string | null) => out.push({ template_id: id, day, meal, dish_id, side_id: meal === 'dinner' ? 'side-grechka' : null, salad_id: null, simple: null, updated_at: '2026-10-13T00:00:00Z' });
    add('breakfast', day % 2 ? 'br-kasha' : 'br-syrniki');
    add('lunch', soup);
    add('snack', 'sn-yabloki');
    add('dinner', dinner);
  }
  return out;
}

export async function seedMenu(db: LocalDb, opts: { currentWeek?: boolean } = {}) {
  await db.recipes.bulkPut(RECIPES);
  await db.week_templates.bulkPut([
    { id: 'autumn', household_id: null, name: 'Осенняя', season: ['autumn'], note: 'Тыква и капуста, пока дешёвые', updated_at: 'x', deleted_at: null },
    { id: 'quick', household_id: null, name: 'Быстрая', season: ['any'], note: 'Ужин за полчаса', updated_at: 'x', deleted_at: null },
  ]);
  await db.template_slots.bulkPut([...templateDays('autumn', 'mn-kotlety', 'sp-borsch'), ...templateDays('quick', 'mn-plov', 'sp-ukha')]);
  if (opts.currentWeek) {
    await db.weeks.put({ id: 'w-cur', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: 'm-papa', updated_at: 'x', deleted_at: null });
    await db.week_slots.bulkPut(templateDays('autumn', 'mn-kotlety', 'sp-borsch').map(({ template_id, ...s }): WeekSlot => ({ ...s, week_id: 'w-cur', household_id: 'h1' })));
  }
}
```

- [ ] **Step 2: Падающий тест**

`app/src/features/menu/MenuPage.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

describe('MenuPage', () => {
  it('shows today in the current week with the soup pot day', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('Сейчас: «Осенняя», 12–18 октября')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Обед: Борщ/ })).toBeInTheDocument();
    expect(screen.getByText(/кастрюля на 7 дней, 2-й день/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ужин: Котлеты/ })).toBeInTheDocument();
  });

  it('asks to choose a week when there is none for this Monday', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('Неделя на 12–18 октября не выбрана')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать неделю' })).toBeInTheDocument();
  });

  it('offers a child to propose instead of choose', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Предложить неделю' })).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/features/menu/MenuPage.test.tsx`
Expected: FAIL — модуль `./MenuPage` не найден.

- [ ] **Step 3: Данные экрана**

`app/src/features/menu/useMenu.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb, Recipe } from '../../data/db';
import { addDaysIso, mondayOf } from './week';

export function useMenu(db: LocalDb, householdId: string, today: Date) {
  const start = mondayOf(today);
  const nextStart = addDaysIso(start, 7);
  return useLiveQuery(async () => {
    const weekAt = (s: string) => db.weeks.where('[household_id+starts_on]').equals([householdId, s]).filter((w) => !w.deleted_at).first();
    const [week, nextWeek] = await Promise.all([weekAt(start), weekAt(nextStart)]);
    const slotsOf = async (id?: string) => (id ? db.week_slots.where('week_id').equals(id).toArray() : []);
    const [slots, nextSlots, nextVotes, recipes, templates] = await Promise.all([
      slotsOf(week?.id), slotsOf(nextWeek?.id),
      nextWeek ? db.votes.where('week_id').equals(nextWeek.id).toArray() : Promise.resolve([]),
      db.recipes.toArray(),
      db.week_templates.filter((t) => !t.deleted_at && (t.household_id === null || t.household_id === householdId)).toArray(),
    ]);
    return {
      current: { start, week, slots },
      next: { start: nextStart, week: nextWeek, slots: nextSlots, votes: nextVotes },
      recipes: new Map<string, Recipe>(recipes.map((r) => [r.id, r])),
      templates: templates.sort((a, b) => Number(a.household_id !== null) - Number(b.household_id !== null) || a.name.localeCompare(b.name, 'ru')),
    };
  }, [db, householdId, start]);
}
```

- [ ] **Step 4: Экран**

`app/src/features/menu/MealRow.tsx`:

```tsx
import Icon from '../shell/Icon';

export default function MealRow({ name, label, time, extra, note, onOpen }: { name: string; label: string; time: string; extra: string[]; note?: string; onOpen: () => void }) {
  return (
    <button type="button" className="row meal-row" onClick={onOpen} aria-label={`${label}: ${name}. Заменить`}>
      <span className="row-main">
        <b>{name}</b>
        <small>{label} · {time}{extra.length ? ` · ${extra.join(', ')}` : ''}</small>
        {note ? <small className="dima-note">Диме: {note}</small> : null}
      </span>
      <Icon name="chev" className="chev" />
    </button>
  );
}
```

`app/src/features/menu/MenuPage.tsx`:

```tsx
import { useState } from 'react';
import Header from '../shell/Header';
import { localDb, type LocalDb, type WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useMenu } from './useMenu';
import MealRow from './MealRow';
import { dayOfWeek, MEAL_LABEL, MEAL_TIME, MEALS, soupBatches, soupOn, weekLabel, addDaysIso, type Meal } from './week';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAME = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const daysWord = (n: number) => (n === 1 ? 'день' : n < 5 ? 'дня' : 'дней');

export type MenuSheet =
  | { kind: 'slot'; day: number; meal: Meal }
  | { kind: 'day'; day: number }
  | { kind: 'week'; mode: 'current' | 'next' };

export default function MenuPage({ me, members, db = localDb, today = new Date() }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const data = useMenu(db, me.household_id, today);
  const [day, setDay] = useState(dayOfWeek(today));
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  if (!data) return <><Header title="Меню" /><p className="note" style={{ margin: 16 }}>Загружаем меню…</p></>;
  const { current, recipes, templates } = data;
  const parent = me.role === 'parent';
  const name = (id: string | null) => (id ? recipes.get(id)?.name ?? 'Блюдо удалено' : '');
  const slotAt = (d: number, meal: Meal): WeekSlot | undefined => current.slots.find((s) => s.day === d && s.meal === meal);
  const template = templates.find((t) => t.id === current.week?.template_id);

  if (!current.week) {
    return (
      <>
        <Header title="Меню" subtitle={`Неделя ${weekLabel(current.start)}`} />
        <section className="card">
          <div className="card-h"><h2>Неделя на {weekLabel(current.start)} не выбрана</h2></div>
          <p className="note">Возьмите один из шаблонов — меню и список покупок соберутся сами. Потом любое блюдо можно заменить.</p>
          <div className="btns fill" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setSheet({ kind: 'week', mode: parent ? 'current' : 'next' })}>{parent ? 'Выбрать неделю' : 'Предложить неделю'}</button>
          </div>
        </section>
        {sheet ? <SheetHost sheet={sheet} close={() => setSheet(null)} me={me} members={members} db={db} data={data} /> : null}
      </>
    );
  }

  const row = (meal: Meal) => {
    const s = slotAt(day, meal);
    const extra: string[] = [];
    let main = name(s?.dish_id ?? null);
    let note: string | undefined;
    if (meal === 'lunch') {
      const pot = soupOn(current.slots, day);
      if (pot && pot.of > 1) extra.push(`кастрюля на ${pot.of} ${daysWord(pot.of)}, ${pot.nth}-й день`);
      note = recipes.get(s?.dish_id ?? '')?.dima_note || undefined;
    }
    if (meal === 'dinner') note = recipes.get(s?.dish_id ?? '')?.dima_note || undefined;
    if (meal === 'snack' && !s?.dish_id && s?.simple) main = s.simple.simple;
    if (s?.side_id) extra.push(lower(name(s.side_id)));
    if (s?.salad_id) extra.push(lower(name(s.salad_id)));
    return <MealRow key={meal} name={main || 'Не выбрано'} label={MEAL_LABEL[meal]} time={MEAL_TIME[meal]} extra={extra} note={parent ? note : undefined} onOpen={() => setSheet({ kind: 'slot', day, meal })} />;
  };
  const date = (d: number) => Number(addDaysIso(current.start, d).slice(8));

  return (
    <>
      <Header title="Меню" subtitle={`Неделя ${weekLabel(current.start)} · ${current.week.status === 'approved' ? 'утверждена' : 'предложена'}`} />
      <NextWeekHero me={me} members={members} db={db} data={data} openWeek={() => setSheet({ kind: 'week', mode: 'next' })} />
      <section className="week-bar">
        <span className="row-main"><b>Сейчас: «{template?.name ?? 'своя неделя'}», {weekLabel(current.start)}</b><small>{template?.note ?? ''}</small></span>
        <button type="button" className="btn soft sm" onClick={() => setSheet({ kind: 'week', mode: parent ? 'current' : 'next' })}>{parent ? 'Сменить' : 'Предложить'}</button>
      </section>
      <div className="days" role="group" aria-label="Дни недели">
        {DAY_SHORT.map((d, i) => (
          <button key={d} type="button" className={`day ${i === dayOfWeek(today) ? 'today' : ''}`} aria-pressed={i === day} aria-label={DAY_NAME[i]} onClick={() => setDay(i)}>{d}<b>{date(i)}</b><i /></button>
        ))}
      </div>
      <div className="soup-line">
        {soupBatches(current.slots).map((b) => <span key={`${b.dish_id}-${b.from}`} className="pill soft" style={{ ['--h' as string]: 'var(--k-meal)' }}>{name(b.dish_id)} · {DAY_SHORT[b.from]}{b.to > b.from ? `–${DAY_SHORT[b.to]}` : ''}</span>)}
      </div>
      <section className="card">
        <div className="card-h"><h2>{DAY_NAME[day]}, {date(day)}</h2><button type="button" className="more" onClick={() => setSheet({ kind: 'day', day })}>Заменить день</button></div>
        {MEALS.map(row)}
        <p className="note">Нажмите на блюдо, чтобы заменить его блюдом из другой недели или из всех рецептов.</p>
      </section>
      {sheet ? <SheetHost sheet={sheet} close={() => setSheet(null)} me={me} members={members} db={db} data={data} /> : null}
    </>
  );
}
```

`NextWeekHero` и `SheetHost` появятся в задачах 8–9. До них в `MenuPage.tsx` объявить заглушки, которые возвращают `null`:

```tsx
function NextWeekHero(_p: { me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; openWeek: () => void }) { return null; }
function SheetHost(_p: { sheet: MenuSheet; close: () => void; me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>> }) { return null; }
```

В `App.tsx` маршрут `/menu` → `<MenuPage me={me} members={fam.members} />`.

- [ ] **Step 5: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, включая MenuPage (3).

```bash
git add app/src && git commit -m "feat: show the current week, days and meals on the Menu screen" && git push origin main
```

---

### Task 8: Замена блюда и целого дня

**Files:**
- Create: `app/src/features/menu/actions.ts`, `app/src/features/menu/actions.test.ts`
- Create: `app/src/features/menu/SlotSheet.tsx`, `app/src/features/menu/DaySheet.tsx`, `app/src/features/menu/Sheet.tsx`, `app/src/features/menu/sheets.test.tsx`
- Modify: `app/src/features/menu/MenuPage.tsx` (`SheetHost` показывает окна `slot` и `day`)

**Interfaces:**
- Consumes: `writeLocal` (задача 4), `LocalDb`, `WeekSlot`, `TemplateSlot`, `Recipe` (задача 3), `fitsMeal`, `Meal` (задача 2), `useMenu` (задача 7).
- Produces:
  - `replaceMeal(db, week: Week, day: number, meal: Meal, src: { fromSlot: TemplateSlot | WeekSlot } | { recipe: Recipe; sides: string[] }): Promise<void>`;
  - `replaceDay(db, week: Week, day: number, src: Array<TemplateSlot | WeekSlot>): Promise<void>`;
  - `canEditWeek(me: Member, week: Week): boolean`;
  - `Sheet({ title, sub?, onClose, children, actions? })` — общая шторка;
  - `SlotSheet`, `DaySheet`.

- [ ] **Step 1: Падающие тесты действий**

`app/src/features/menu/actions.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type Week } from '../../data/db';
import { canEditWeek, replaceDay, replaceMeal } from './actions';
import { RECIPES, seedMenu, templateDays } from './testData';
import type { Member } from '../family/useFamily';

const week: Week = { id: 'w-cur', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: 'm-papa', updated_at: 'x', deleted_at: null };
const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('menu actions', () => {
  it('replaces one meal with a day of another template and queues it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const src = templateDays('quick', 'mn-plov', 'sp-ukha').find((s) => s.day === 4 && s.meal === 'dinner')!;
    await replaceMeal(db, week, 1, 'dinner', { fromSlot: src });
    const s = await db.week_slots.get(['w-cur', 1, 'dinner']);
    expect([s?.dish_id, s?.side_id]).toEqual(['mn-plov', 'side-grechka']);
    expect(await db.outbox.count()).toBe(1);
  });

  it('replaces one meal with any recipe and its first side', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await replaceMeal(db, week, 2, 'dinner', { recipe: RECIPES.find((r) => r.id === 'mn-plov')!, sides: [] });
    const s = await db.week_slots.get(['w-cur', 2, 'dinner']);
    expect([s?.dish_id, s?.side_id]).toEqual(['mn-plov', null]);
  });

  it('replaces a whole day with four meals of another day', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await replaceDay(db, week, 1, templateDays('quick', 'mn-plov', 'sp-ukha').filter((s) => s.day === 5));
    const day = await db.week_slots.where('week_id').equals('w-cur').filter((s) => s.day === 1).toArray();
    expect(day.map((s) => s.dish_id).sort()).toEqual(['br-kasha', 'mn-plov', 'sn-yabloki', 'sp-ukha'].sort());
    expect(await db.outbox.count()).toBe(4);
  });

  it('lets only parents edit an approved week', () => {
    expect(canEditWeek(papa, week)).toBe(true);
    expect(canEditWeek({ ...papa, role: 'child' }, week)).toBe(false);
    expect(canEditWeek({ ...papa, role: 'child' }, { ...week, status: 'proposed' })).toBe(true);
  });
});
```

Run: `npm test -- src/features/menu/actions.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Действия**

`app/src/features/menu/actions.ts`:

```ts
import { writeLocal } from '../../data/sync';
import type { LocalDb, Recipe, TemplateSlot, Week, WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Meal } from './week';

type Source = { fromSlot: TemplateSlot | WeekSlot } | { recipe: Recipe; sides: string[] };

const slotRow = (week: Week, day: number, meal: Meal, s: Pick<WeekSlot, 'dish_id' | 'side_id' | 'salad_id' | 'simple'>) => ({
  week_id: week.id, household_id: week.household_id, day, meal,
  dish_id: s.dish_id, side_id: s.side_id, salad_id: s.salad_id, simple: s.simple,
});

export const canEditWeek = (me: Member, week: Week) => me.role === 'parent' || week.status !== 'approved';

export async function replaceMeal(db: LocalDb, week: Week, day: number, meal: Meal, src: Source) {
  const s = 'fromSlot' in src
    ? src.fromSlot
    : { dish_id: src.recipe.id, side_id: meal === 'dinner' ? src.sides[0] ?? null : null, salad_id: null, simple: null };
  await writeLocal(db, 'week_slots', [slotRow(week, day, meal, s)]);
}

export async function replaceDay(db: LocalDb, week: Week, day: number, src: Array<TemplateSlot | WeekSlot>) {
  await writeLocal(db, 'week_slots', src.map((s) => slotRow(week, day, s.meal, s)));
}
```

- [ ] **Step 3: Падающий тест окон**

`app/src/features/menu/sheets.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

describe('replace sheets', () => {
  it('swaps a dinner for a day of another week', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Ужин: Котлеты/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Быстрая' }));
    await userEvent.click(screen.getByRole('button', { name: /Пт · Плов/ }));
    await waitFor(async () => expect((await db.week_slots.get(['w-cur', 1, 'dinner']))?.dish_id).toBe('mn-plov'));
    expect(await screen.findByRole('button', { name: /Ужин: Плов/ })).toBeInTheDocument();
  });

  it('finds a recipe by name among all recipes', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Завтрак: Сырники/ }));
    await userEvent.click(screen.getByRole('tab', { name: 'Все рецепты' }));
    await userEvent.type(screen.getByRole('searchbox'), 'овся');
    expect(screen.getByRole('button', { name: /Овсяная каша/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Сырники/ })).toBeNull();
  });

  it('replaces the whole day', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Заменить день' }));
    await userEvent.click(screen.getByRole('button', { name: 'Быстрая' }));
    await userEvent.click(screen.getByRole('button', { name: /Поставить/ }));
    expect(await screen.findByRole('button', { name: /Обед: Уха/ })).toBeInTheDocument();
  });

  it('tells a child that an approved week belongs to parents', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };
    render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Ужин: Котлеты/ }));
    expect(screen.getByText('Утверждённую неделю меняют родители. Предложите блюдо — им придёт просьба.')).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/features/menu/sheets.test.tsx`
Expected: FAIL — `SheetHost` пока возвращает `null`, окна не открываются.

- [ ] **Step 4: Окна**

`app/src/features/menu/Sheet.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import Icon from '../shell/Icon';

export default function Sheet({ title, sub, onClose, children, actions }: { title: string; sub?: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label="Закрыть" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head"><h2>{title}</h2><button type="button" className="round-btn" aria-label="Закрыть" onClick={onClose}><Icon name="x" /></button></div>
        {sub ? <p className="sheet-sub">{sub}</p> : null}
        {children}
        {actions ? <div className="sheet-actions">{actions}</div> : null}
      </section>
    </>
  );
}
```

`app/src/features/menu/SlotSheet.tsx`:

```tsx
import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import Icon from '../shell/Icon';
import type { LocalDb, Recipe, TemplateSlot, Week, WeekSlot, WeekTemplate } from '../../data/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { fitsMeal, MEAL_LABEL, type Meal } from './week';
import { replaceMeal } from './actions';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_ACC = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' } as const;

export function lineOf(s: Pick<WeekSlot, 'dish_id' | 'side_id' | 'simple'> | undefined, recipes: Map<string, Recipe>) {
  if (!s) return 'Не выбрано';
  const main = s.dish_id ? recipes.get(s.dish_id)?.name ?? 'Блюдо удалено' : s.simple?.simple ?? 'Не выбрано';
  const side = s.side_id ? recipes.get(s.side_id)?.name : undefined;
  return side ? `${main} + ${side.charAt(0).toLowerCase()}${side.slice(1)}` : main;
}

export default function SlotSheet({ db, week, day, meal, currentSlot, recipes, templates, editable, onClose }: {
  db: LocalDb; week: Week; day: number; meal: Meal; currentSlot?: WeekSlot; recipes: Map<string, Recipe>; templates: WeekTemplate[]; editable: boolean; onClose: () => void;
}) {
  const [tab, setTab] = useState<'weeks' | 'all'>('weeks');
  const [tpl, setTpl] = useState(templates.find((t) => t.id !== week.template_id)?.id ?? templates[0]?.id);
  const [q, setQ] = useState('');
  const tplSlots = useLiveQuery(() => (tpl ? db.template_slots.where('template_id').equals(tpl).filter((s) => s.meal === meal).toArray() : []), [db, tpl, meal]) ?? [];
  const sides = useLiveQuery(() => db.recipe_sides.toArray(), [db]) ?? [];
  const all = useMemo(() => [...recipes.values()].filter((r) => fitsMeal(r, meal)).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [recipes, meal]);
  const title = `${MEAL_LABEL[meal]} ${DAY_ACC[day]}`;

  if (!editable) {
    return <Sheet title={title} sub={`Сейчас: ${lineOf(currentSlot, recipes)}`} onClose={onClose}><p className="note" style={{ margin: '0 16px 16px' }}>Утверждённую неделю меняют родители. Предложите блюдо — им придёт просьба.</p></Sheet>;
  }
  const pick = async (src: Parameters<typeof replaceMeal>[4]) => { await replaceMeal(db, week, day, meal, src); onClose(); };
  const shown = all.filter((r) => !q || r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Sheet title={title} sub={`Сейчас: ${lineOf(currentSlot, recipes)}`} onClose={onClose}>
      <div className="segs sheet-segs" role="tablist" aria-label="Откуда взять">
        <button type="button" role="tab" aria-selected={tab === 'weeks'} onClick={() => setTab('weeks')}>Из других недель</button>
        <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>Все рецепты</button>
      </div>
      {tab === 'weeks' ? (
        <>
          <div className="col-chips sheet-chips" role="group" aria-label="Неделя">
            {templates.map((t) => <button key={t.id} type="button" aria-pressed={t.id === tpl} onClick={() => setTpl(t.id)}>{t.name}</button>)}
          </div>
          <div className="opts">
            {[...tplSlots].sort((a, b) => a.day - b.day).map((s: TemplateSlot) => (
              <button key={s.day} type="button" className="opt" aria-label={`${DAY_SHORT[s.day]} · ${lineOf(s, recipes)}`} onClick={() => pick({ fromSlot: s })}>
                <span className="opt-day">{DAY_SHORT[s.day]}</span><span className="row-main"><b>{lineOf(s, recipes)}</b></span><Icon name="swap" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <label className="search sheet-search"><span className="vh">Найти блюдо</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Блюдо" autoComplete="off" /></label>
          <div className="opts">
            {shown.map((r) => (
              <button key={r.id} type="button" className="opt" onClick={() => pick({ recipe: r, sides: sides.filter((x) => x.recipe_id === r.id).map((x) => x.side_id) })}>
                <span className="row-main"><b>{r.name}</b><small>{r.time_total} мин · {DIMA[r.dima_level]}</small></span><Icon name="swap" />
              </button>
            ))}
          </div>
          {shown.length ? null : <p className="empty">Ничего не нашли.</p>}
        </>
      )}
    </Sheet>
  );
}
```

`app/src/features/menu/DaySheet.tsx`:

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from './Sheet';
import Icon from '../shell/Icon';
import type { LocalDb, Recipe, Week, WeekTemplate } from '../../data/db';
import { MEAL_LABEL, MEAL_TIME, MEALS } from './week';
import { replaceDay } from './actions';
import { lineOf } from './SlotSheet';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];

export default function DaySheet({ db, week, day, recipes, templates, editable, onClose }: {
  db: LocalDb; week: Week; day: number; recipes: Map<string, Recipe>; templates: WeekTemplate[]; editable: boolean; onClose: () => void;
}) {
  const [tpl, setTpl] = useState(templates.find((t) => t.id !== week.template_id)?.id ?? templates[0]?.id);
  const [src, setSrc] = useState(day);
  const slots = useLiveQuery(() => (tpl ? db.template_slots.where('template_id').equals(tpl).filter((s) => s.day === src).toArray() : []), [db, tpl, src]) ?? [];
  if (!editable) {
    return <Sheet title={`Заменить ${DAY_ACC[day]} целиком`} onClose={onClose}><p className="note" style={{ margin: '0 16px 16px' }}>Утверждённую неделю меняют родители. Предложите блюдо — им придёт просьба.</p></Sheet>;
  }
  const apply = async () => { await replaceDay(db, week, day, slots); onClose(); };
  return (
    <Sheet title={`Заменить ${DAY_ACC[day]} целиком`} sub="Возьмите любой день из любой недели." onClose={onClose}
      actions={<button type="button" className="btn" onClick={apply} disabled={slots.length !== 4}><Icon name="swap" />Поставить на {DAY_ACC[day]}</button>}>
      <div className="col-chips sheet-chips" role="group" aria-label="Неделя">
        {templates.map((t) => <button key={t.id} type="button" aria-pressed={t.id === tpl} onClick={() => setTpl(t.id)}>{t.name}</button>)}
      </div>
      <div className="days sheet-days" role="group" aria-label="День недели">
        {DAY_SHORT.map((d, i) => <button key={d} type="button" className="day" aria-pressed={i === src} onClick={() => setSrc(i)}>{d}</button>)}
      </div>
      <div className="day-preview">
        {MEALS.map((m) => (
          <div className="row" key={m}><span className="tl-t">{MEAL_TIME[m]}</span><span className="row-main"><b>{lineOf(slots.find((s) => s.meal === m), recipes)}</b><small>{MEAL_LABEL[m]}</small></span></div>
        ))}
      </div>
    </Sheet>
  );
}
```

В `Icon.tsx` добавить символ `swap` из `mockups/index.html`:

```ts
swap: '<path d="M7 4 4 7l3 3"/><path d="M4 7h13"/><path d="m17 20 3-3-3-3"/><path d="M20 17H7"/>',
```

В `MenuPage.tsx` заменить заглушку `SheetHost`:

```tsx
function SheetHost({ sheet, close, me, db, data }: { sheet: MenuSheet; close: () => void; me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>> }) {
  const week = data.current.week;
  if (sheet.kind === 'slot' && week) {
    return <SlotSheet db={db} week={week} day={sheet.day} meal={sheet.meal} currentSlot={data.current.slots.find((s) => s.day === sheet.day && s.meal === sheet.meal)}
      recipes={data.recipes} templates={data.templates} editable={canEditWeek(me, week)} onClose={close} />;
  }
  if (sheet.kind === 'day' && week) return <DaySheet db={db} week={week} day={sheet.day} recipes={data.recipes} templates={data.templates} editable={canEditWeek(me, week)} onClose={close} />;
  return null;
}
```

С импортами `SlotSheet`, `DaySheet`, `canEditWeek`. Окно `week` появится в задаче 9.

- [ ] **Step 5: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, включая actions (4) и sheets (4).

```bash
git add app/src && git commit -m "feat: replace any meal or a whole day from another week or the recipe base" && git push origin main
```

---

### Task 9: Выбор недели, предложение, голоса, утверждение

**Files:**
- Create: `app/src/features/menu/weekActions.ts`, `app/src/features/menu/weekActions.test.ts`
- Create: `app/src/features/menu/WeekSheet.tsx`, `app/src/features/menu/NextWeekHero.tsx`, `app/src/features/menu/week-flow.test.tsx`
- Modify: `app/src/features/menu/MenuPage.tsx`: заглушка `NextWeekHero` → настоящий компонент, в `SheetHost` добавить окно `week`.

**Interfaces:**
- Consumes: `writeLocal`, `LocalDb`, `Week`, `TemplateSlot`, `Vote`, `Member`, `weekLabel`, `addDaysIso`.
- Produces:
  - `setWeekFromTemplate(db, args: { household: string; startsOn: string; template: string; status: 'proposed' | 'approved'; by: string; existing?: Week }): Promise<Week>` — новая неделя (`crypto.randomUUID()`) или обновление существующей плюс 28 слотов из шаблона;
  - `voteWeek(db, week: Week, member: Member, value: 'yes' | 'changes', comment?: string)`;
  - `approveWeek(db, week: Week, parent: Member)`;
  - компоненты `WeekSheet({ db, mode, me, data, onClose })` и `NextWeekHero({ me, members, db, data, openWeek })`.

- [ ] **Step 1: Падающие тесты действий**

`app/src/features/menu/weekActions.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import { approveWeek, setWeekFromTemplate, voteWeek } from './weekActions';
import { seedMenu } from './testData';
import type { Member } from '../family/useFamily';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };

describe('week actions', () => {
  it('builds a week of 28 meals from a template', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const w = await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-12', template: 'autumn', status: 'approved', by: 'm-papa' });
    expect(w.status).toBe('approved');
    expect(await db.week_slots.where('week_id').equals(w.id).count()).toBe(28);
    expect(await db.outbox.count()).toBe(29);
  });

  it('switches an existing week to another template keeping its id', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const existing = (await db.weeks.get('w-cur'))!;
    const w = await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-12', template: 'quick', status: 'approved', by: 'm-papa', existing });
    expect(w.id).toBe('w-cur');
    expect((await db.week_slots.get(['w-cur', 0, 'dinner']))?.dish_id).toBe('mn-plov');
  });

  it('records votes and a parent approval', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const w = await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-19', template: 'quick', status: 'proposed', by: 'm-son' });
    await voteWeek(db, w, son, 'yes');
    await approveWeek(db, w, papa);
    expect((await db.votes.get([w.id, 'm-son']))?.value).toBe('yes');
    expect((await db.weeks.get(w.id))?.status).toBe('approved');
    expect((await db.weeks.get(w.id))?.approved_by).toBe('m-papa');
  });
});
```

Run: `npm test -- src/features/menu/weekActions.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Действия недели**

`app/src/features/menu/weekActions.ts`:

```ts
import { writeLocal } from '../../data/sync';
import type { LocalDb, Week } from '../../data/db';
import type { Member } from '../family/useFamily';

export async function setWeekFromTemplate(db: LocalDb, a: { household: string; startsOn: string; template: string; status: 'proposed' | 'approved'; by: string; existing?: Week }): Promise<Week> {
  const week: Week = {
    id: a.existing?.id ?? crypto.randomUUID(),
    household_id: a.household,
    starts_on: a.startsOn,
    template_id: a.template,
    status: a.status,
    proposed_by: a.status === 'proposed' ? a.by : a.existing?.proposed_by ?? null,
    approved_by: a.status === 'approved' ? a.by : null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  const src = await db.template_slots.where('template_id').equals(a.template).toArray();
  await writeLocal(db, 'weeks', [week]);
  await writeLocal(db, 'week_slots', src.map((s) => ({
    week_id: week.id, household_id: a.household, day: s.day, meal: s.meal,
    dish_id: s.dish_id, side_id: s.side_id, salad_id: s.salad_id, simple: s.simple,
  })));
  return week;
}

export async function voteWeek(db: LocalDb, week: Week, member: Member, value: 'yes' | 'changes', comment = '') {
  await writeLocal(db, 'votes', [{ week_id: week.id, member_id: member.id, household_id: week.household_id, value, comment }]);
}

export async function approveWeek(db: LocalDb, week: Week, parent: Member) {
  await writeLocal(db, 'weeks', [{ ...week, status: 'approved', approved_by: parent.id }]);
}
```

Неделя и её слоты уходят в очереди одной цепочкой: сначала строка недели, потом слоты. Сервер примет слоты только после недели, порядок `outbox` это гарантирует.

- [ ] **Step 3: Падающий тест сценария**

`app/src/features/menu/week-flow.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

describe('choosing and approving weeks', () => {
  it('lets a parent set this week from a template', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать неделю' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Поставить «Быстрая»' }));
    expect(await screen.findByText('Сейчас: «Быстрая», 12–18 октября')).toBeInTheDocument();
  });

  it('lets a child propose next week and a parent approve it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const { unmount } = render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Предложить' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Предложить «Быстрая»' }));
    expect(await screen.findByText('Сын (вы) предлагает неделю «Быстрая» на 19–25 октября')).toBeInTheDocument();
    unmount();

    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('За: Сын.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Утвердить' }));
    expect(await screen.findByText('Утверждено')).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/features/menu/week-flow.test.tsx`
Expected: FAIL — окно выбора недели не открывается.

- [ ] **Step 4: Окно выбора недели и блок «следующая неделя»**

`app/src/features/menu/WeekSheet.tsx`:

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from './Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { useMenu } from './useMenu';
import { setWeekFromTemplate, voteWeek } from './weekActions';
import { weekLabel } from './week';
import { lineOf } from './SlotSheet';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function WeekSheet({ db, mode, me, data, onClose }: { db: LocalDb; mode: 'current' | 'next'; me: Member; data: NonNullable<ReturnType<typeof useMenu>>; onClose: () => void }) {
  const target = mode === 'current' ? data.current : data.next;
  const [pick, setPick] = useState(target.week?.template_id ?? data.templates[0]?.id);
  const slots = useLiveQuery(() => (pick ? db.template_slots.where('template_id').equals(pick).toArray() : []), [db, pick]) ?? [];
  const t = data.templates.find((x) => x.id === pick);
  const apply = async () => {
    if (!pick) return;
    const w = await setWeekFromTemplate(db, { household: me.household_id, startsOn: target.start, template: pick, status: mode === 'current' ? 'approved' : 'proposed', by: me.id, existing: target.week });
    if (mode === 'next') await voteWeek(db, w, me, 'yes');
    onClose();
  };
  return (
    <Sheet title={`Неделя на ${weekLabel(target.start)}`}
      sub={mode === 'current' ? 'Выберите шаблон: меню и список покупок соберутся заново.' : 'Выберите шаблон и предложите семье, родители утвердят.'}
      onClose={onClose}
      actions={<button type="button" className="btn" onClick={apply} disabled={!pick}>{mode === 'current' ? `Поставить «${t?.name ?? ''}»` : `Предложить «${t?.name ?? ''}»`}</button>}>
      <div className="tpl-list" role="radiogroup" aria-label="Шаблоны недель">
        {data.templates.map((x) => (
          <button key={x.id} type="button" className="tpl" role="radio" aria-checked={x.id === pick} onClick={() => setPick(x.id)}>
            <span className="tpl-top"><b>{x.name}{x.household_id ? <span className="tpl-now">наш</span> : null}</b></span>
            <small>{x.note}</small>
          </button>
        ))}
      </div>
      {t ? <h3 className="sh-h">«{t.name}» по дням</h3> : null}
      <div className="day-preview">
        {DAY_SHORT.map((d, i) => {
          const dinner = slots.find((s) => s.day === i && s.meal === 'dinner');
          const lunch = slots.find((s) => s.day === i && s.meal === 'lunch');
          return <div className="row" key={d}><span className="tl-t">{d}</span><span className="row-main"><b>{lineOf(dinner, data.recipes)}</b><small>{lineOf(lunch, data.recipes)}</small></span></div>;
        })}
      </div>
    </Sheet>
  );
}
```

`app/src/features/menu/NextWeekHero.tsx`:

```tsx
import Icon from '../shell/Icon';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { useMenu } from './useMenu';
import { approveWeek, voteWeek } from './weekActions';
import { weekLabel } from './week';

export default function NextWeekHero({ me, members, db, data, openWeek }: { me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; openWeek: () => void }) {
  const { next, templates } = data;
  const label = weekLabel(next.start);
  if (!next.week) {
    return (
      <section className="hero" aria-label={`Неделя на ${label}`}>
        <h2>Неделя на {label} ещё не выбрана</h2>
        <p>Предложите шаблон — семья проголосует, родители утвердят.</p>
        <div className="hero-chips"><button type="button" className="hero-chip primary" onClick={openWeek}>Выбрать неделю</button></div>
      </section>
    );
  }
  const t = templates.find((x) => x.id === next.week!.template_id);
  const by = members.find((m) => m.id === next.week!.proposed_by);
  const yes = next.votes.filter((v) => v.value === 'yes').map((v) => members.find((m) => m.id === v.member_id)?.name).filter(Boolean);
  const voted = next.votes.some((v) => v.member_id === me.id);
  const approved = next.week.status === 'approved';
  return (
    <section className="hero" aria-label={`Неделя на ${label}`}>
      <h2>{by ? `${by.name}${by.id === me.id ? ' (вы)' : ''} предлагает` : 'Предложена'} неделю «{t?.name ?? 'своя'}» на {label}</h2>
      <p>{yes.length ? `За: ${yes.join(', ')}.` : 'Голосов пока нет.'}</p>
      <div className="hero-chips">
        {approved ? <span className="hero-chip">Утверждено</span> : null}
        <button type="button" className="hero-chip" onClick={openWeek}>Посмотреть или другая</button>
        {!approved && me.role === 'parent' ? <button type="button" className="hero-chip primary" onClick={() => approveWeek(db, next.week!, me)}>Утвердить</button> : null}
        {!approved && me.role !== 'parent' && !voted ? <button type="button" className="hero-chip primary" onClick={() => voteWeek(db, next.week!, me, 'yes')}><Icon name="check" />За</button> : null}
      </div>
    </section>
  );
}
```

В `MenuPage.tsx`:
- удалить заглушку `NextWeekHero`, импортировать настоящий компонент;
- в `SheetHost` добавить `if (sheet.kind === 'week') return <WeekSheet db={db} mode={sheet.mode} me={me} data={data} onClose={close} />;`;
- в ветке «неделя не выбрана» тоже показывать `<NextWeekHero …/>` под карточкой — так видно, что предложено на следующую неделю.

- [ ] **Step 5: Тесты проходят, коммит**

Run: `npm test`
Expected: PASS — весь набор, включая weekActions (3) и week-flow (2).

```bash
git add app/src && git commit -m "feat: choose, propose, vote on and approve weeks" && git push origin main
```

---

### Task 10: Своя неделя как шаблон и статус синхронизации

**Files:**
- Create: `app/src/features/menu/saveTemplate.ts`, `app/src/features/menu/saveTemplate.test.ts`
- Create: `app/src/features/settings/SyncStatus.tsx`, `app/src/features/settings/SyncStatus.test.tsx`
- Modify: `app/src/features/menu/MenuPage.tsx` (кнопка «Сохранить как шаблон» у родителя), `app/src/features/settings/Settings.tsx` (карточка «Приложение»)

**Interfaces:**
- Consumes: `writeLocal`, `useSync` (задачи 4, 6), `WeekSlot`.
- Produces:
  - `saveWeekAsTemplate(db, week: Week, slots: WeekSlot[], name: string): Promise<string>` — id вида `h-<uuid>`;
  - `syncLine(s: { offline: boolean; pending: number; syncedAt: string | null }, now: Date): string`;
  - компонент `SyncStatus()`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/menu/saveTemplate.test.ts`:

```ts
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
```

`app/src/features/settings/SyncStatus.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { syncLine } from './SyncStatus';

const NOW = new Date(2026, 9, 14, 11, 40);

describe('syncLine', () => {
  it('says everything is saved with the time', () => {
    expect(syncLine({ offline: false, pending: 0, syncedAt: new Date(2026, 9, 14, 11, 38).toISOString() }, NOW)).toBe('всё сохранено · 11:38');
  });
  it('counts changes waiting for the network', () => {
    expect(syncLine({ offline: true, pending: 3, syncedAt: null }, NOW)).toBe('нет сети · 3 изменения ждут отправки');
    expect(syncLine({ offline: true, pending: 1, syncedAt: null }, NOW)).toBe('нет сети · 1 изменение ждёт отправки');
    expect(syncLine({ offline: true, pending: 5, syncedAt: null }, NOW)).toBe('нет сети · 5 изменений ждут отправки');
  });
  it('shows a date for an old sync', () => {
    expect(syncLine({ offline: false, pending: 0, syncedAt: new Date(2026, 9, 12, 9, 5).toISOString() }, NOW)).toBe('всё сохранено · 12.10 в 09:05');
  });
});
```

Run: `npm test -- src/features/menu/saveTemplate.test.ts src/features/settings/SyncStatus.test.tsx`
Expected: FAIL — модули не найдены.

- [ ] **Step 2: Реализация**

`app/src/features/menu/saveTemplate.ts`:

```ts
import { writeLocal } from '../../data/sync';
import type { LocalDb, Week, WeekSlot } from '../../data/db';

export async function saveWeekAsTemplate(db: LocalDb, week: Week, slots: WeekSlot[], name: string): Promise<string> {
  const id = `h-${crypto.randomUUID()}`;
  await writeLocal(db, 'week_templates', [{ id, household_id: week.household_id, name: name.trim(), season: ['any'], note: 'Своя неделя семьи', deleted_at: null }]);
  await writeLocal(db, 'template_slots', slots.map((s) => ({ template_id: id, day: s.day, meal: s.meal, dish_id: s.dish_id, side_id: s.side_id, salad_id: s.salad_id, simple: s.simple })));
  return id;
}
```

`app/src/features/settings/SyncStatus.tsx`:

```tsx
import Icon from '../shell/Icon';
import { useSync } from '../../data/SyncProvider';

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

export function syncLine(s: { offline: boolean; pending: number; syncedAt: string | null }, now: Date): string {
  if (s.pending > 0) {
    const what = `${s.pending} ${plural(s.pending, 'изменение ждёт', 'изменения ждут', 'изменений ждут')} отправки`;
    return s.offline ? `нет сети · ${what}` : what;
  }
  if (!s.syncedAt) return s.offline ? 'нет сети · данные на телефоне' : 'ещё не сохраняли';
  const t = new Date(s.syncedAt);
  const sameDay = t.toDateString() === now.toDateString();
  const time = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  return `всё сохранено · ${sameDay ? time : `${pad(t.getDate())}.${pad(t.getMonth() + 1)} в ${time}`}`;
}

export default function SyncStatus() {
  const s = useSync();
  return (
    <section className="card">
      <div className="card-h"><h2>Приложение</h2></div>
      <div className="row">
        <span className="row-main"><b>Работает без интернета</b><small>{syncLine(s, new Date())}</small></span>
        {s.pending === 0 && !s.offline ? <Icon name="check" className="ok" /> : null}
      </div>
      {s.message ? <p className="form-error" role="alert">{s.message}</p> : null}
      <button type="button" className="row set-row" onClick={() => s.syncNow()} disabled={s.syncing}>
        <span className="row-main"><b>{s.syncing ? 'Сохраняем…' : 'Сохранить сейчас'}</b></span>
      </button>
    </section>
  );
}
```

В `Settings.tsx` перед карточкой «Вход» добавить `<SyncStatus />`.

В `MenuPage.tsx` у родителя под карточкой дня — кнопка `«Сохранить неделю как шаблон»`, класс `more`. Она открывает шторку с полем «Название» и кнопкой «Сохранить». По сохранению вызывается `saveWeekAsTemplate` и показывается подсказка «Шаблон «…» сохранён — он появится в выборе недели».

```tsx
function SaveTemplateSheet({ db, week, slots, onClose }: { db: LocalDb; week: Week; slots: WeekSlot[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const save = async () => { await saveWeekAsTemplate(db, week, slots, name); onClose(); };
  return (
    <Sheet title="Сохранить неделю как шаблон" sub="Со всеми заменами. Потом её можно выбрать на любую неделю." onClose={onClose}
      actions={<button type="button" className="btn" disabled={!name.trim()} onClick={save}>Сохранить</button>}>
      <label className="field" style={{ margin: '0 16px' }}>Название<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Наша осень" /></label>
    </Sheet>
  );
}
```

В `MenuSheet` добавить вариант `{ kind: 'save' }`, а в `SheetHost` — `if (sheet.kind === 'save' && week) return <SaveTemplateSheet db={db} week={week} slots={data.current.slots} onClose={close} />;`.

- [ ] **Step 3: Тесты проходят, сборка, выкладка**

Run: `npm test && npm run build`
Expected: PASS — весь набор, сборка без ошибок.

```bash
git add app/src && git commit -m "feat: save a week as a family template and show sync status" && git push origin main
```

Vercel выкладывает `main` сам. Проверка на сайте:
1. войти;
2. Меню → «Выбрать неделю» → «Осенняя» → «Поставить»;
3. заменить ужин;
4. в режиме полёта заменить завтрак;
5. включить сеть;
6. Настройки → «Работает без интернета» показывает «всё сохранено».
