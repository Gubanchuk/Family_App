# «Дома» и корзина на поход — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в Покупках появляются «Дома» (продукты есть / закончились) и корзина на один поход (продукты выбранных приёмов, блюд и строк), обе связаны с общим списком.

**Architecture:** одна миграция добавляет таблицу `home_stock`, колонку `shopping_marks.at_home`, источник строки `home` и подпись, состав и конец похода в `shop_trips`. Приложение шлёт новое только после пробы колонки (`COLUMN_FEATURES.homeCart`), как в третьем круге. Логика в чистых функциях (`stock.ts`, `tripCart.ts`), экраны — отдельные компоненты в `features/shop`.

**Tech Stack:** React 19, TypeScript, Dexie (локальная база + outbox), Supabase/PostgREST, PGlite для тестов базы, Vitest + Testing Library, Playwright для живых сценариев.

**Spec:** `docs/superpowers/specs/2026-10-17-home-stock-trip-cart-design.md`

## Global Constraints

- «Дома» и корзиной пользуются все, кто входит в приложение, дети тоже: без проверки роли.
- Пока на сервере нет миграции, Покупки работают как сейчас: ни переключателя «Дома», ни «Есть дома», ни выбора корзины; новые колонки не уходят на сервер.
- «Есть дома» и «закончилось» — только два состояния, без количества.
- Отделы «Одежда и обувь» и «Техника» при покупке в «Дома» не попадают; продукты с `pantry` из словаря тоже.
- Поход живёт 3 часа (`TRIP_MS` в `ShopPage.tsx`), пока его не закончили.
- Комментарии в коде — короткий нейтральный английский, как в соседнем коде. Тексты интерфейса — по-русски, в тоне приложения.
- Коммиты — conventional commits, в конце `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Тесты гонять по папкам (`npx vitest run <paths>` в `app`); полный набор — только в конце: на этом ПК 8 ГБ памяти.

## Review Focus

1. Два телефона без сети отмечают один продукт «закончилось» → после синхронизации в списке одна строка (Task 3, тест `two phones marking one product out make one line`).
2. Своё название с другим регистром, пробелами или «ё» («Хлеб », «хлеб») — тот же продукт в «Дома» (Task 3, тест `one product whatever the case and spaces`).
3. Строки корзины, которые пересборка меню удалила или которые кто-то убрал, — корзина показывает оставшиеся, без пустых строк и падений (Task 6, тест `skips cart lines that are gone`).
4. Выбранный приём, все продукты которого уже куплены, «есть дома» или «всегда есть», — корзина пуста, лист говорит почему и даёт «Беру весь список» (Task 7, тест `says why a pick adds nothing`).
5. Телефон без миграции на сервере: строка, закрытая «есть дома» на новом телефоне, у него выглядит открытой, ничего не ломается и не уходит с ошибкой (Task 3, тест `does not send at_home before the server has it`).

---

### Task 1: Миграция и тесты базы

**Files:**
- Create: `supabase/migrations/20261017000900_home_stock_trip_cart.sql`
- Test: `app/tests/db/homeStock.test.ts` (по образцу `app/tests/db/visibility.test.ts`)

**Interfaces:**
- Produces (сервер):
  - таблица `public.home_stock (household_id uuid, key text, item text null references ingredients(item), title text, dept text, state text, by_member uuid null, updated_at timestamptz, deleted_at timestamptz)`, первичный ключ `(household_id, key)`; проверки: `length(key) between 1 and 100`, `length(title) between 1 and 80`, `state in ('have','out')`.
  - `shopping_marks.at_home boolean not null default false`, проверка `not (bought and at_home)`.
  - `shopping_items.source` допускает `'home'`.
  - `shop_trips.label text null` (≤ 80), `shop_trips.items jsonb null` (массив, ≤ 300 элементов), `shop_trips.ended_at timestamptz null`.

- [ ] **Step 1: Тесты базы (падают)**

```ts
it('lets the whole family read and change what is at home, and nobody else', ...)
  // мама добавляет {key:'молоко', item:'молоко', title:'Молоко', dept:'Молочное и яйца', state:'have'};
  // сын (child) меняет state на 'out' — проходит; чужой видит 0 строк и не может вставить в чужую семью.
it('keeps a line bought or at home, never both', ...)
  // insert в shopping_marks с bought=true, at_home=true → rejects.toThrow()
it('takes a line that ran out at home', ...)
  // insert shopping_items source='home' → проходит
it('lets only the shopper change the trip', ...)
  // папа вставляет поход с label 'завтрак на завтра', items '[{"id":"m:w:молоко","hint":"на завтрак: 500 мл"}]';
  // папа ставит ended_at — проходит; мама обновить чужой поход не может (0 строк изменено).
```

- [ ] **Step 2:** `npx vitest run tests/db/homeStock.test.ts` — FAIL (таблицы/колонок нет).
- [ ] **Step 3:** Миграция. RLS для `home_stock` — как у `shopping_items` (вся семья читает, добавляет, меняет), триггер `touch_updated_at`, `grant select, insert, update`, добавление в `supabase_realtime` в том же `do $$` блоке, что в `20261014000700_shopping.sql`. Источник строки: снять старую проверку `source` по тексту её определения (как в `20261017000600_base_photos.sql` для `photo_path`) и поставить новую с `'home'`. `by_member` — член той же семьи (триггер-страж по образцу `guard_shopping_item`).
- [ ] **Step 4:** тесты PASS; заодно `npx vitest run tests/db tests/contract`.
- [ ] **Step 5:** Commit `feat(db): home stock, at-home marks and trip carts`.

### Task 2: Локальная база и синхронизация

**Files:**
- Modify: `app/src/data/db.ts`, `app/src/data/sync.ts`, `app/src/data/SyncProvider.tsx`, `app/src/data/fakeSupabase.ts` (если колонку надо объявить), `app/src/dev/Preview.tsx` (feature в превью)
- Test: `app/src/data/sync.test.ts` (или файл, где уже тестируются `COLUMN_FEATURES`), `app/tests/contract/homeStock.test.ts`

**Interfaces:**
- Produces:
  - `type HomeStock = { household_id: string; key: string; item: string | null; title: string; dept: string; state: 'have' | 'out'; by_member: string | null; updated_at: string; deleted_at: string | null }`
  - `type TripLine = { id: string; hint: string | null }`
  - `ShoppingItem.source: 'menu' | 'manual' | 'offer' | 'home'`, `ShoppingItem.created_at?: string`
  - `ShoppingMark.at_home?: boolean`
  - `ShopTrip.label?: string | null; items?: TripLine[] | null; ended_at?: string | null`
  - `SyncTable` и `TABLES` включают `'home_stock'`; `KEY_FIELDS.home_stock = ['household_id', 'key']`; Dexie `version(7)`: `home_stock: '[household_id+key], household_id'`
  - `COLUMN_FEATURES.homeCart = ['shopping_marks', 'at_home']`; `useFeature(db, 'homeCart')`
  - `home_stock` слушается во втором realtime-канале (`family-more-*`), как поздние таблицы.

- [ ] **Step 1: Тесты (падают)**
  - `finds homeCart only when the column answers`: `probeColumns` с `fakeSupabase`, где у `shopping_marks` нет `at_home`, не добавляет `homeCart`; с колонкой — добавляет.
  - контрактный: `setStock`, `runOut`, `setAtHome`, `goShopping` с корзиной и `endTrip` (из Tasks 3 и 7) проходят upsert на PGlite с настоящими миграциями. Пишется в этом же таске как скелет; функции подключаются по мере появления — допустимо держать `it.todo` до Task 7.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Типы, версия Dexie, ключи, таблица в `TABLES`, realtime, проба.
- [ ] **Step 4:** `npx vitest run src/data tests/contract` — PASS.
- [ ] **Step 5:** Commit `feat(data): home stock table and the homeCart column probe`.

### Task 3: Действия «Дома»

**Files:**
- Create: `app/src/features/shop/stock.ts`
- Modify: `app/src/features/shop/shopActions.ts` (`setBought`)
- Test: `app/src/features/shop/stock.test.ts`, `app/src/features/shop/shopActions.test.ts`

**Interfaces:**
- Consumes: `HomeStock`, `writeLocal`, `features` (Task 2).
- Produces:
  - `stockKey(a: { item: string | null; title: string }): string` — `item`, иначе `'t:' + title` в нижнем регистре, без крайних пробелов, с одиночными пробелами, `ё → е`.
  - `NOT_STOCKED = ['Одежда и обувь', 'Техника']`
  - `setStock(db: LocalDb, me: Member, a: { item: string | null; title: string; dept: string }, state: 'have' | 'out'): Promise<void>`
  - `removeStock(db: LocalDb, s: HomeStock): Promise<void>` — `deleted_at`.
  - `stockFromBought(db: LocalDb, me: Member, line: ShoppingItem, vocab: Map<string, Ingredient>): Promise<void>` — ставит «есть», кроме `NOT_STOCKED` и `pantry`.
  - `homeLineId(key: string, weekStart: string, n: number): string` → `` `h:${weekStart}:${n}:${key}` ``
  - `runOut(db: LocalDb, me: Member, s: HomeStock, ctx: { items: ShoppingItem[]; marks: Map<string, ShoppingMark>; weekStart: string }): Promise<'reopened' | 'added' | 'already'>`
  - `setAtHome(db: LocalDb, item: ShoppingItem, me: Member, on: boolean, prev?: ShoppingMark): Promise<boolean>` — пишет отметку `{ bought: false, at_home: on, price_real: prev?.price_real ?? null }` и при `on` — `setStock(..., 'have')`; без `homeCart` возвращает `false`.
  - `setBought(db, item, me, bought, prev?, home?: { vocab: Map<string, Ingredient> })` — новый необязательный параметр; при `bought && home` вызывает `stockFromBought`; если у `prev` есть ключ `at_home`, кладёт `at_home: false`.

- [ ] **Step 1: Тесты (падают)**
  - `one product whatever the case and spaces`: `stockKey({ item: null, title: ' Хлеб  бородинский ' }) === stockKey({ item: null, title: 'хлеб Бородинский' })`; `stockKey({ item: null, title: 'Ёлка' }) === 't:елка'`.
  - `bought food goes home, clothes do not`: после `setBought(..., true, undefined, { vocab })` для строки «Молоко» есть `home_stock` `'have'`; для строки отдела «Одежда и обувь» и для `pantry`-продукта — нет.
  - `out reopens a line kept as at home`: строка закрыта `at_home` → `runOut` возвращает `'reopened'`, отметка `at_home: false`, новых строк нет.
  - `out adds one line when the list has none`: `runOut` → `'added'`, строка `source: 'home'`, `id === homeLineId(key, weekStart, 0)`, `title` из «Дома», `dept` оттуда же.
  - `out does nothing when the line is still to buy`: → `'already'`.
  - `two phones marking one product out make one line`: два `runOut` на двух базах с одинаковым состоянием дают один и тот же `id`.
  - `a product bought this week and out again gets a new line`: строка `homeLineId(key, w, 0)` куплена → новый `id` с `n = 1`.
  - `does not send at_home before the server has it`: без `homeCart` в `meta.features` `setAtHome` возвращает `false` и ничего не пишет; `setBought` по отметке без ключа `at_home` не кладёт `at_home` в outbox.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализация. `n` в `runOut` — число уже купленных строк `home` этого продукта за неделю.
- [ ] **Step 4:** `npx vitest run src/features/shop` — PASS.
- [ ] **Step 5:** Commit `feat(shop): home stock actions; bought food goes home`.

### Task 4: Список видит «есть дома»

**Files:**
- Modify: `app/src/features/shop/build.ts` (`listTotals`), `app/src/features/shop/useShop.ts` (`visibleItems`, загрузка `home_stock`), `app/src/features/shop/ShopPage.tsx` (строка, итоги, отделы), `app/src/features/shop/ItemSheet.tsx`, `app/src/features/home/HomePage.tsx` (плитка «Покупки»)
- Test: `app/src/features/shop/build.test.ts`, `app/src/features/shop/ShopPage.test.tsx`, `app/src/features/home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `setAtHome`, `stockKey` (Task 3).
- Produces:
  - `listTotals(rows: Array<{ est; real; bought; home?: boolean }>)` — `home` считается в `doneCount`, не в `bought`, `left`, `unpriced`.
  - `visibleItems` показывает `source: 'home'` по правилу `manual`.
  - `useShop(...)` дополнительно возвращает `stock: HomeStock[]` (без удалённых) и `hasHome: boolean` (= `useFeature(db, 'homeCart')` снаружи, решает ShopPage).
  - `ItemSheet` получает `onHome?: (on: boolean) => Promise<void>`; кнопка «Есть дома» / «Вернуть в покупки», только когда `onHome` передан.

- [ ] **Step 1: Тесты (падают)**
  - `listTotals counts an at-home line as done without money`: `[{est:100, real:null, bought:false, home:true}, {est:50, real:null, bought:false}]` → `{ count: 2, doneCount: 1, bought: 0, left: 50, unpriced: 0 }`.
  - `closes a line as at home from its sheet`: в ShopPage с `homeCart` тап по цене строки «Молоко» → «Есть дома» → строка с текстом «есть дома» внизу отдела, заголовок «Отмечено 1 из N», сумма «Осталось» уменьшилась на её цену; в `home_stock` молоко `'have'`.
  - `hints a line whose product is at home`: `home_stock` молоко `'have'`, строка открыта → у неё подсказка «дома есть».
  - `names a line that ran out at home`: строка `source: 'home'` → «закончилось дома · Мама».
  - `no home buttons before the server has them`: без `homeCart` в листе строки нет «Есть дома».
  - Главная: плитка «Покупки» не считает строку `at_home` в «осталось купить».
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализация. Тап по строке, закрытой «есть дома», возвращает её в покупки (`setAtHome(..., false)`).
- [ ] **Step 4:** `npx vitest run src/features/shop src/features/home src/features/money` — PASS (траты не изменились: `at_home` не `bought`).
- [ ] **Step 5:** Commit `feat(shop): close a line as at home; hints and totals know it`.

### Task 5: Экран «Дома»

**Files:**
- Create: `app/src/features/shop/HomePanel.tsx`
- Modify: `app/src/features/shop/ShopPage.tsx` (переключатель), `app/src/styles/components.css` (если нужно)
- Test: `app/src/features/shop/HomePanel.test.tsx`

**Interfaces:**
- Consumes: `setStock`, `removeStock`, `runOut`, `stockKey`, `NOT_STOCKED` (Task 3); `guessDept` из `shopActions.ts`; `deptRank` из `build.ts`.
- Produces: `HomePanel({ db, me, stock, vocab, items, marks, weekStart })` — экран; ShopPage показывает `segs` «Список · Дома» (параметр `?view=home`), только при `homeCart`.

- [ ] **Step 1: Тесты (падают)**
  - `adds a product from the dictionary or by its own name`: поиск «твор» → «Добавить: творог» → строка «Творог · есть» в отделе «Молочное и яйца»; своё «Корм для кота» → отдел по `guessDept`.
  - `out puts the product on the list for everyone`: «Закончилось» у «Молоко» → в `shopping_items` строка `source: 'home'`; на вкладке «Список» она видна.
  - `found some again`: у продукта «закончилось» кнопка «Есть» ставит `'have'` (строка в списке остаётся — её закроют покупкой или «Есть дома»).
  - `removes a product from home`.
  - `empty home explains itself`: без продуктов — подсказка, что сюда попадает купленное и как добавить самому.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализация: группы по отделам в порядке `deptRank`, «закончилось» вверху отдела.
- [ ] **Step 4:** `npx vitest run src/features/shop` — PASS.
- [ ] **Step 5:** Commit `feat(shop): «Дома» — what is at home and what ran out`.

### Task 6: Расчёт корзины

**Files:**
- Create: `app/src/features/shop/tripCart.ts`
- Test: `app/src/features/shop/tripCart.test.ts`

**Interfaces:**
- Consumes: `buildMenuList`, `formatQty` (`build.ts`); `soupOn`, `MEAL_LABEL`, `DAY_ACC`, `addDaysIso` (`menu/week.ts`); `TripLine`, `ShopTrip` (Task 2).
- Produces:
  - `type Pick = { kind: 'meal'; day: number; meal: Meal } | { kind: 'dish'; day: number; dish_id: string }`
  - `dishesOf(pick: Pick, slots: WeekSlot[], offers: DishOffer[], weekStart: string): string[]` — блюдо, гарнир и салат приёма; взятое «вместо» заменяет блюдо меню; «поверх меню» на этот день и приём добавляется.
  - `cartFromPicks(inp: { picks: Pick[]; slots: WeekSlot[]; offers: DishOffer[]; weekStart: string; build: Omit<BuildInput, 'slots'>; lines: ShoppingItem[]; marks: Map<string, ShoppingMark> }): { lines: TripLine[]; skipped: Array<{ item: string; why: 'bought' | 'home' | 'pantry' | 'absent' }> }`
  - `pickLabel(picks: Pick[], today: number, dishName: (id: string) => string): string` — «завтрак на завтра», «обед сегодня», «ужин в четверг», для блюда — его название строчными; несколько через запятую.
  - `activeTrips(trips: ShopTrip[], now: Date): ShopTrip[]` — без `ended_at`, моложе 3 часов, по одному (последнему) на человека, новые первыми.
  - `cartRows(trip: ShopTrip, items: ShoppingItem[], marks: Map<string, ShoppingMark>): Array<{ item: ShoppingItem; hint: string | null; addedBy: string | null }>`

- [ ] **Step 1: Тесты (падают)**
  - `breakfast tomorrow takes the week lines of its products`: завтра на завтрак сырники (творог 500 г, яйца 1, мука 60 г на 4 порции, семья 3.5) → в `lines` id строк `m:w:творог`, `m:w:яйца`, `m:w:мука`; подсказка творога `на завтрак: 438 г` (500 × 3.5 / 4, формат `formatQty`).
  - `a dish taken instead replaces the menu dish`: на обед взят плов вместо супа → в корзине продукты плова, не супа.
  - `bought, at home and pantry stay out with a reason`: молоко куплено, творог `at_home`, соль `pantry` → `skipped` с `'bought'`, `'home'`, `'pantry'`.
  - `two picks add up`: завтрак и полдник с общим продуктом → одна строка, подсказка `на выбранное: …` с суммой.
  - `skips cart lines that are gone`: в `trip.items` id удалённой строки → `cartRows` её не возвращает.
  - `takes lines added by others during the trip`: строка `manual`, `created_at` позже `started_at`, `added_by` не ходящий → в `cartRows` с `addedBy`; своя такая же и добавленная до похода — нет.
  - `one trip per person, three hours`: два похода одного человека → последний; поход старше 3 часов или с `ended_at` → нет.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализация: `buildMenuList` по слотам выбранного (`{ day, meal, dish_id, side_id, salad_id, simple }` из `dishesOf`), сопоставление с `lines` по `item`; при нескольких строках одного продукта берутся все открытые.
- [ ] **Step 4:** `npx vitest run src/features/shop/tripCart.test.ts` — PASS.
- [ ] **Step 5:** Commit `feat(shop): what a trip cart holds and who is shopping`.

### Task 7: Поход: выбор, корзина, конец

**Files:**
- Create: `app/src/features/shop/TripSheet.tsx`
- Modify: `app/src/features/shop/shopActions.ts` (`goShopping`, `endTrip`), `app/src/features/shop/ShopPage.tsx`, `app/src/features/shop/useShop.ts` (все активные походы вместо `lastTrip`)
- Test: `app/src/features/shop/TripSheet.test.tsx`, `app/src/features/shop/ShopPage.test.tsx`, контрактный тест из Task 2 (снять `todo`)

**Interfaces:**
- Consumes: всё из Task 6; `setBought` с `home` (Task 3).
- Produces:
  - `goShopping(db, me, at = new Date(), cart?: { label: string; items: TripLine[] }): Promise<void>` — `label`/`items` пишутся только при `homeCart`.
  - `endTrip(db: LocalDb, trip: ShopTrip, at = new Date()): Promise<void>`
  - `TripSheet({ db, me, data, today, onClose })` — лист «Что берём».

- [ ] **Step 1: Тесты (падают)**
  - `picks breakfast tomorrow and shops only for it`: «Иду в магазин» → «Завтра» → «Завтрак» → «Пошли» → вкладка «Корзина» выбрана, видны только строки творога, яиц, муки по отделам, с подсказками; «Весь список» показывает всё.
  - `a tick in the cart is the tick in the list`: отметка в корзине → в «Весь список» та же строка куплена.
  - `says why a pick adds nothing`: всё для выбранного куплено → лист говорит «Всё для этого уже куплено или есть дома», кнопка «Пошли» недоступна, «Беру весь список» доступна.
  - `own line goes to the cart and the list`: «Дописать своё» «Хлеб» → строка в корзине и в общем списке.
  - `takes the whole list like before`: «Беру весь список» → поход без корзины, экран как сейчас.
  - `ends the trip`: «Закончить поход» → `ended_at`, экран снова «Иду в магазин», некупленное в списке.
  - `names everyone shopping and what for`: два активных похода других → плашка «Папа в магазине с 10:15: завтрак на завтра» и вторая строка про маму.
  - `without the server column the button works as before`: без `homeCart` «Иду в магазин» сразу ставит поход, листа нет.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализация. Дни — с сегодняшнего до конца недели списка; блюда — дня выбранного приёма (или всех приёмов дня, если приём не выбран); строки — некупленные открытые строки недели, по отделам, с галочками.
- [ ] **Step 4:** `npx vitest run src/features/shop src/features/home tests/contract` — PASS.
- [ ] **Step 5:** Commit `feat(shop): a cart for one trip — pick meals, dishes or lines, shop, finish`.

### Task 8: Пуш о походе с подписью

**Files:**
- Modify: `supabase/functions/_shared/messages.ts`, `supabase/functions/notify/index.ts`
- Test: `app/tests/push/messages.test.ts`

**Interfaces:**
- Produces: `Ev` для `shop_trips` — `{ kind: 'shop_trips'; author: string; label: string | null }`; `notify` передаёт `row.label ?? null`.

- [ ] **Step 1:** Тест `names what the trip is for`: `compose({ kind: 'shop_trips', author: 'Андрей', label: 'завтрак на завтра' }, today)` → тело содержит «завтрак на завтра»; с `label: null` — прежний текст.
- [ ] **Step 2:** FAIL. **Step 3:** реализация. **Step 4:** `npx vitest run tests/push` — PASS.
- [ ] **Step 5:** Commit `feat(push): the shop trip push says what it is for`. Владельцу: `npx supabase functions deploy notify --no-verify-jwt`.

### Task 9: Живой сценарий и проверка целиком

**Files:**
- Create: `app/e2e/shop-cart.spec.ts`

- [ ] **Step 1:** Сценарий (идёт только после `db push` владельца; до этого `test.skip`, если у мамы нет переключателя «Дома» за 30 с):
  - мама ставит неделю, «Иду в магазин» → «Завтра» → «Завтрак» → «Пошли», в корзине только строки завтрака;
  - сын видит плашку «Мама в магазине … завтрак на завтра», добавляет «Хлеб» → у мамы в корзине «Хлеб · добавил Сын»;
  - мама отмечает строку в корзине → у сына в списке она куплена;
  - мама в «Дома» жмёт «Закончилось» у купленного продукта → у сына строка «закончилось дома».
- [ ] **Step 2:** Полный набор `npx vitest run`, `npx tsc -b`, `npm run lint`, затем `npm run e2e` — всё зелёное (новый сценарий может быть пропущен до миграции).
- [ ] **Step 3:** Commit `test(e2e): trip cart and home stock on live`, push.
- [ ] **Step 4:** Свежий ревьюер (opus) смотрит весь диф; важное чинится с тестом.
