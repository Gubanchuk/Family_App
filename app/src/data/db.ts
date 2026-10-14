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
export type OutboxOp = { seq?: number; table: SyncTable; rpc?: 'save_week'; row: Record<string, unknown>; created_at: string; tries: number };
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
