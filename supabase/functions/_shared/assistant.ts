// The assistant's contract, shared by the Edge Function (which sends the tools to the model) and the app
// (which runs them on the phone and decides which ones need a «Сделать?» first).
// Spec: docs/superpowers/specs/2026-10-25-assistant-design.md

export const MODEL = 'claude-opus-5-5';

// read: answered from the phone's data at once. auto: done at once, the card offers «Отменить».
// confirm: the card asks «Сделать / Не надо» first — others will see it, or it is money.
export type ToolKind = 'read' | 'auto' | 'confirm';

type Schema = { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
export type ToolDef = { name: string; description: string; input_schema: Schema; kind: ToolKind; parentsOnly?: boolean };

const date = { type: 'string', description: 'Дата в формате YYYY-MM-DD.' };
const meal = { type: 'string', enum: ['breakfast', 'lunch', 'snack', 'dinner'], description: 'breakfast — завтрак, lunch — обед, snack — полдник, dinner — ужин.' };

export const TOOLS: ToolDef[] = [
  {
    name: 'find_recipes',
    kind: 'read',
    description: 'Ищет рецепты в базе семьи (общая база и свои рецепты). Используй всегда, когда нужен рецепт или блюдо: не придумывай блюда, которых нет в базе, если человек прямо не просит идею со стороны. Возвращает до 10 рецептов: id, название, время, теги, подходит ли Диме, главные продукты и сколько из них есть дома.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Слова из названия или описания: «сырники», «суп», «курица».' },
        products: { type: 'array', items: { type: 'string' }, description: 'Продукты, которые должны быть в рецепте.' },
        from_home: { type: 'boolean', description: 'true — ставить выше рецепты из того, что дома отмечено «есть».' },
        meal,
        max_minutes: { type: 'integer', minimum: 5, description: 'Не дольше стольких минут всего.' },
        for_dima: { type: 'boolean', description: 'true — только то, что можно Диме (2 года), как есть или с поправкой.' },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_recipe',
    kind: 'read',
    description: 'Открывает рецепт целиком: продукты в количестве на нашу семью, шаги, пометка для Димы, время.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'add_to_shopping',
    kind: 'auto',
    description: 'Добавляет товары в ближайший поход в магазин (и в общий список покупок). Сразу видно всей семье. Перед вызовом одной фразой скажи, что сейчас добавишь. Количество указывай, если оно понятно из разговора или рецепта.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array', minItems: 1, maxItems: 30,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Как товар называется в магазине: «молоко», «куриное филе».' },
              amount: { type: 'number', exclusiveMinimum: 0 },
              unit: { type: 'string', enum: ['г', 'кг', 'мл', 'л', 'шт', 'уп'] },
              urgent: { type: 'boolean', description: 'true — нужно сегодня.' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_home_stock',
    kind: 'auto',
    description: 'Отмечает продукты дома: «есть» (have) или «закончилось» (out). Закончившийся продукт сам попадает в список покупок.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array', minItems: 1, maxItems: 30,
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, state: { type: 'string', enum: ['have', 'out'] } },
            required: ['name', 'state'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_family',
    kind: 'confirm',
    description: 'Создаёт просьбу члену семьи на Доске; ему придёт уведомление. Человек сначала подтвердит её в карточке.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Имя члена семьи, как в снимке семьи.' },
        text: { type: 'string', maxLength: 120, description: 'Сама просьба, коротко, от лица спрашивающего: «Купи Диме сироп от кашля».' },
        due: date,
        urgent: { type: 'boolean' },
      },
      required: ['to', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'offer_dish',
    kind: 'confirm',
    description: 'Предлагает блюдо из базы на день и приём пищи: поверх меню (over) или вместо блюда меню (instead). Продукты блюда сами попадут в покупки. Человек сначала подтвердит в карточке.',
    input_schema: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string' },
        date,
        meal,
        how: { type: 'string', enum: ['over', 'instead'] },
        to: { type: 'string', description: 'Кого просим приготовить (имя). Пусто — любой.' },
        cook_myself: { type: 'boolean', description: 'true — спрашивающий приготовит сам.' },
      },
      required: ['recipe_id', 'date', 'meal', 'how'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_expense',
    kind: 'confirm',
    parentsOnly: true,
    description: 'Вносит расход в «Деньги» (например, по фото чека). Человек сначала подтвердит сумму в карточке.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', exclusiveMinimum: 0, description: 'Сумма в рублях.' },
        category: { type: 'string', description: 'Категория из списка категорий в снимке семьи.' },
        note: { type: 'string', maxLength: 80, description: 'Что купили: «Магнит, продукты».' },
        date,
      },
      required: ['amount', 'note'],
      additionalProperties: false,
    },
  },
];

export const toolsFor = (role: 'parent' | 'child') => TOOLS.filter((t) => role === 'parent' || !t.parentsOnly);
export const kindOf = (name: string): ToolKind | null => TOOLS.find((t) => t.name === name)?.kind ?? null;

// What the function answers besides a model reply. The app turns each into a plain sentence.
export type AssistantError = 'not_member' | 'bad_request' | 'daily_limit' | 'no_credit' | 'busy' | 'refusal' | 'failed';

// $ per million tokens for MODEL (cached 2026-10-06 price table): input, output, cache write (5 min), cache read.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
export function costUsd(u: Usage): number {
  return (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output
    + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) / 1e6;
}

// $100 a month over 30 days is about $3.3 a day; $5 leaves room for a busy day.
export const DAILY_LIMIT_USD = 5;
