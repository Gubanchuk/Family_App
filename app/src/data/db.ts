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
export type DishOffer = { id: string; household_id: string; from_member: string; to_member: string | null; dish_id: string; on_date: string; meal: Meal; how: 'over' | 'instead'; status: 'open' | 'taken' | 'declined'; taken_by: string | null; updated_at: string; deleted_at: string | null };
export type ShoppingItem = { id: string; household_id: string; week_id: string | null; offer_id: string | null; source: 'menu' | 'manual' | 'offer'; item: string | null; title: string; qty: number | null; unit: string | null; qty_text: string; dept: string; urgent: boolean; est_price: number | null; added_by: string | null; updated_at: string; deleted_at: string | null };
export type ShoppingMark = { item_id: string; household_id: string; bought: boolean; by_member: string | null; price_real: number | null; updated_at: string };
export type ShopTrip = { id: string; household_id: string; member_id: string; started_at: string; updated_at: string };
export type NotEat = { household_id: string; kind: 'item' | 'dish'; ref: string; updated_at: string; deleted_at: string | null };
export type SyncTable = 'weeks' | 'week_slots' | 'votes' | 'week_templates' | 'template_slots'
  | 'dish_offers' | 'shopping_items' | 'shopping_marks' | 'shop_trips' | 'not_eat';
export type OutboxOp = { seq?: number; table: SyncTable; rpc?: 'save_week'; row: Record<string, unknown>; created_at: string; tries: number };
export type Meta = { key: string; value: unknown };

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
  dish_offers!: Table<DishOffer, string>;
  shopping_items!: Table<ShoppingItem, string>;
  shopping_marks!: Table<ShoppingMark, string>;
  shop_trips!: Table<ShopTrip, string>;
  not_eat!: Table<NotEat, [string, string, string]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores(V1_STORES);
    this.version(2).stores({
      dish_offers: 'id, household_id, on_date',
      shopping_items: 'id, household_id, week_id',
      shopping_marks: 'item_id',
      shop_trips: 'id, household_id',
      not_eat: '[household_id+kind+ref], household_id',
    });
  }
}

export const createLocalDb = (name = 'family-app') => new LocalDb(name);
export const localDb = createLocalDb();
