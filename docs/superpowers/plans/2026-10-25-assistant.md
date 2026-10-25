# Помощник — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** экран «Помощник» с разговором, снимком данных семьи и действиями в приложении; сервер — Edge Function `assistant` с Claude.

**Architecture:** договор инструментов и цены — `supabase/functions/_shared/assistant.ts`, системная инструкция — `_shared/assistantPrompt.ts` (оба уже написаны). Функция только проверяет вызывающего, считает расход и передаёт историю в Claude; инструменты выполняет телефон: функция возвращает ответ модели, телефон выполняет `tool_use` и шлёт `tool_result` следующим запросом. История хранится на телефоне в Dexie (локальная таблица, не синхронизируется) и только дописывается.

**Tech Stack:** Supabase Edge (Deno 2, `npm:@anthropic-ai/sdk@0.133.0`, `npm:@supabase/supabase-js@2`), React 19, TypeScript, Dexie, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-assistant-design.md`

## Global Constraints

- Модель `claude-opus-5-5` (`MODEL` из `_shared/assistant.ts`), без `thinking` в запросе (адаптивное по умолчанию), `output_config: { effort: 'medium' }`, `max_tokens: 16000`, без стриминга.
- Беты: `server-side-fallback-2026-07-01`, параметр `fallbacks: 'default'`. Ничего про `temperature`/`top_p`.
- История только дописывается: телефон не правит и не удаляет прошлые сообщения, блоки ответа модели (включая `thinking` с подписью и `fallback`) хранит и отправляет как есть. Снимок семьи — текстовый блок в сообщении пользователя, повторяется, только если изменился.
- Ключ — только секрет `ANTHROPIC_API_KEY` функции.
- Комментарии в коде — короткий нейтральный английский, как в соседнем коде. Тексты интерфейса — по-русски, в тоне приложения (глаголы на кнопках, коротко).
- Коммиты — conventional commits, в конце `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Каждый агент добавляет в коммит только свои файлы (`git add <paths>`), никогда `git add -A`.
- Тесты гонять по папкам (`npx vitest run <paths>` в `app`); полный набор — только в конце: на этом ПК 8 ГБ памяти.

## Review Focus

1. Ребёнок не получает `add_expense` ни в списке инструментов, ни выполнением на телефоне.
2. История после действия с подтверждением, отказа «Не надо», ошибки сети и повторной отправки — валидная последовательность для API: у каждого `tool_use` ровно один `tool_result` в следующем сообщении пользователя, ничего не правится задним числом.
3. Отмена действия не трогает чужие правки: убирает только то, что добавило это действие.
4. Нет связи / нет кредита / дневной лимит / отказ модели — человек видит понятное предложение и «Повторить», разговор не ломается.

---

### Task A1: Edge Function `assistant` и учёт расходов

**Files:**
- Create: `supabase/functions/assistant/index.ts`, `supabase/functions/_shared/assistantRequest.ts` (чистая логика: проверка тела, сборка запроса к Claude, разбор ошибок, обрезка `thinking` для повтора)
- Create: `supabase/migrations/20261025000100_assistant_usage.sql`
- Test: `app/tests/push/assistantRequest.test.ts`, `app/tests/db/assistantUsage.test.ts` (по образцу соседних тестов PGlite)

**Interfaces:**
- Тело запроса: `{ mode: 'chat', messages: MessageParam[], screen?: string }` или `{ mode: 'check_product', product: { title: string; unit: string; price: number | null; dept: string } }`.
- Ответ чата: `{ content: ContentBlock[], stop_reason: string }`; проверки: `{ ok: boolean, note: string }`; ошибка: `{ error: AssistantError }` с HTTP 200 (как у `recipe-import`), кроме 405/400.
- `buildChatRequest(messages, role)` → объект для `client.beta.messages.create` (system с `cache_control` на статичной инструкции, `tools` из `toolsFor(role)` без поля `kind`/`parentsOnly`, верхнеуровневый `cache_control: { type: 'ephemeral' }`).
- `validateMessages(x)`: массив 1–120, первое сообщение `user`, роли `user`/`assistant`, картинки только base64 jpeg/png/webp до 1,5 МБ каждая, всё тело до 4 МБ.
- `classifyError(e)`: 400 с «credit balance» → `no_credit`; 429/529 → `busy`; 400 про `signature` → повтор один раз без блоков `thinking`/`redacted_thinking`; остальное → `failed`. `stop_reason: 'refusal'` → `refusal`.
- Роль и семья — запросом `members` с токеном пользователя (как `recipe-import`): `id, household_id, role`, первая живая строка. Нет — `not_member`.
- `assistant_usage(id bigint identity, household_id, member_id, at timestamptz default now(), cost_usd numeric, input_tokens int, output_tokens int)`: RLS включён, политик для `authenticated` нет (читать и писать — только функция ключом service role). Перед запросом функция суммирует `cost_usd` семьи за сегодняшний день по Москве; `>= DAILY_LIMIT_USD` → `daily_limit`. После ответа пишет строку (`costUsd(usage)`). Нет таблицы (ошибка `42P01`/PGRST205) — без лимита и без записи.
- Режим `check_product`: `effort: 'low'`, `max_tokens: 2000`, `output_config.format` — JSON-схема `{ ok: boolean, note: string }` с `additionalProperties: false`, системная — `CHECK_PROMPT`.
- CORS — как у `recipe-import`.

**Steps:**
- [ ] Тесты чистой логики (сборка запроса для parent/child, проверка тела, разбор ошибок, обрезка thinking) — RED.
- [ ] `assistantRequest.ts` — GREEN.
- [ ] Миграция + тест PGlite: таблица есть, `authenticated` не читает и не пишет.
- [ ] `index.ts`: сборка из чистых частей, вызов SDK (`new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })`, `client.beta.messages.create({...} as never)`), учёт.
- [ ] `deno check supabase/functions/assistant/index.ts`, если `deno` есть; иначе — внимательное чтение импортов.
- [ ] Коммит.

### Task A2: Разговор на телефоне — хранение, снимок, инструменты, цикл

**Files:**
- Modify: `app/src/data/db.ts` (локальная таблица `assistant_threads`: ключ `member_id`, `{ member_id, messages, snapshot_hash, updated_at }`; новая версия схемы Dexie; в синхронизацию не входит)
- Create: `app/src/features/assistant/snapshot.ts` — текст снимка семьи по данным телефона
- Create: `app/src/features/assistant/tools.ts` — выполнение инструментов, у действий — функция отмены
- Create: `app/src/features/assistant/api.ts` — вызов функции через `supabase.functions.invoke('assistant', …)` с подменой в тестах (как `recipeImport.ts`)
- Create: `app/src/features/assistant/loop.ts` — ход разговора
- Test: рядом, `*.test.ts`

**Interfaces:**
- `buildSnapshot(db, me, members, today, screen) → string`: блок `<снимок_семьи>…</снимок_семьи>`, по-русски, компактно (цель — до ~4000 токенов): кто спрашивает (имя, роль, кем приходится), семья (имена, роли, кем приходятся), сегодня (дата, день недели, время), экран, меню этой и следующей недели по дням (названия блюд; приёмы, где пусто, пропустить), предложенные блюда, поход и список (открытые строки: название, количество, примерная цена, кто добавил, срочно), «Дома» (есть / закончилось), доска (хотелки с ценой и копилкой, надо купить, цели с прогрессом, просьбы с ответом), «не едим», для родителей — деньги месяца (ближайшие платежи, траты по категориям, бюджеты; категории расходов списком). Детям денег нет и так (их нет на телефоне), но функция всё равно проверяет роль.
- `runTool(name, input, ctx) → { result: string, undo?: () => Promise<void>, summary: string }`: `summary` — строка для карточки («Добавляю в поход: молоко 1 л, яйца 10 шт»). Инструменты чтения возвращают JSON-строку. `find_recipes` ищет по названию/описанию/тегам/продуктам, учитывает «не едим», ставит выше рецепты из «Дома: есть» при `from_home`. `get_recipe` — продукты на порции семьи (`meta.family_portions`). `add_to_shopping` — через `addManualItem` (количество текстом из `amount`+`unit`; когда появится строка с количеством из плана похода, перейти на неё); отмена удаляет добавленные строки. `set_home_stock` — через функции `features/shop/stock.ts`; отмена возвращает прежние состояния. `ask_family` — `askFor`; `offer_dish` — `createOffer`; `add_expense` — `saveEntry` (только родитель; для ребёнка — ошибка «нет доступа»). Имя члена семьи ищется без учёта регистра и «ё»; не нашёлся — ошибка с перечнем имён.
- `loop.ts`: `send(text, images, screen)` дописывает сообщение пользователя (снимок, если изменился, + картинки + текст), вызывает функцию, дописывает ответ как есть. `stop_reason === 'tool_use'`: инструменты `read` и `auto` выполняются сразу, `confirm` — ждут решения (`decide(toolUseId, yes)`); когда у всех `tool_use` есть результат, результаты уходят одним сообщением пользователя и цикл продолжается. Не больше 8 обращений к функции на один вопрос. Ошибка сети — сообщение пользователя уже сохранено, «Повторить» отправляет историю заново, не дописывая её второй раз. Разговор длиннее 80 сообщений или ~400 КБ — новый разговор с пометкой. Состояние для экрана: сообщения для показа, карточки действий (`pending` / `running` / `done` / `undone` / `failed` / `declined`), «думает», ошибка.

**Steps:**
- [ ] Тесты снимка на фейковых данных (родитель видит деньги, ребёнок нет; пустая доска не даёт пустых заголовков) — RED → GREEN.
- [ ] Тесты инструментов на Dexie (добавить и отменить, отметить дома и отменить, имя не найдено, ребёнок и расход) — RED → GREEN.
- [ ] Тесты цикла с фейковым `api` (ответ без инструментов; read+auto в одном ответе; confirm «да» и «нет»; ошибка сети и «Повторить»; лимит обращений) — RED → GREEN.
- [ ] Коммит.

### Task A3: Экран «Помощник» и входы

**Files:**
- Create: `app/src/features/assistant/AssistantPage.tsx`, `ActionCard.tsx`, `Markdown.tsx` (жирный, списки, абзацы; без HTML), `AskCard.tsx` (карточка на Главной), `AssistantButton.tsx` (кнопка в шапке), `suggestions.ts` (подсказки по экрану)
- Modify: `app/src/app/App.tsx` (маршрут `/assistant`), `features/home/HomePage.tsx` (карточка под приветствием), шапки `MenuPage`, `ShopPage`, `BoardPage`, `MoneyPage` (кнопка), `styles/*.css`
- Test: `AssistantPage.test.tsx`, `suggestions.test.ts`

**Interfaces:**
- `/assistant?from=shop|menu|board|money|home` — экран во весь экран, шапка «Помощник» с «Назад» и «Новый разговор».
- Пустой разговор: приветствие одной строкой и подсказки экрана (тап — отправить).
- Карточка действия: заголовок «Делаю сам» / «Сделать?», суть, для `confirm` — «Сделать» и «Не надо», после — «Готово · Отменить» (для `auto`) или «Сделано».
- Фото: `<input type="file" accept="image/*">`, сжатие существующими функциями `lib/image.ts` до 1280 px JPEG.
- «Думаю…» — три точки с анимацией (с `prefers-reduced-motion` — без анимации).
- Ошибки — плашка над полем ввода и «Повторить».
- Внешний вид — в языке приложения (токены и классы `styles/`), проверить на 360 px.

**Steps:**
- [ ] Тесты экрана с фейковым циклом — RED → GREEN.
- [ ] Входы на Главной и в шапках.
- [ ] Скриншоты 360 px (dev-превью `/dev/assistant` с фейковыми данными).
- [ ] Коммит.

### Task A4: Запуск и живая проверка

- [ ] `npx supabase functions deploy assistant` (проверка входа включена).
- [ ] Живой e2e `app/e2e/assistant.spec.ts`: новая семья, вопрос «Что приготовить на ужин быстро?» — ответ пришёл; «Добавь в поход молоко 1 л» — карточка «Готово», строка в Покупках.
- [ ] Полный набор тестов, сборка, пуш.
