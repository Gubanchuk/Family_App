// Development-only preview: fills a separate local database from content/ and shows the screens
// without signing in, so layouts can be checked in a browser. Never part of the production bundle.
import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import ingredientsJson from '../../../content/ingredients.json';
import pricesJson from '../../../content/prices.json';
import weeksJson from '../../../content/weeks.json';
import { createLocalDb, type Recipe, type RecipeIngredient, type TemplateSlot, type WeekSlot } from '../data/db';
import type { Member } from '../features/family/useFamily';
import HomePage from '../features/home/HomePage';
import MenuPage from '../features/menu/MenuPage';
import ShopPage from '../features/shop/ShopPage';
import BoardPage from '../features/board/BoardPage';
import MoneyPage from '../features/money/MoneyPage';
import RecipeEditor from '../features/ideas/RecipeEditor';
import { emptyDraft } from '../features/ideas/recipeDraft';
import TabBar from '../features/shell/TabBar';
import { mondayOf, addDaysIso, dayOfWeek } from '../features/menu/week';
import { regenerateWeekList } from '../features/shop/menuList';
import { StoriesContext } from '../features/stories/storiesContext';
import StoryViewer from '../features/stories/StoryViewer';
import StoryEditor from '../features/stories/StoryEditor';
import type { Overlay, Story } from '../features/stories/types';

type Json = Record<string, any>;
const recipeFiles = import.meta.glob('../../../content/recipes/*.json', { eager: true, import: 'default' }) as Record<string, { recipes: Json[] }>;

export const PREVIEW_MEMBERS: Member[] = [
  { id: 'p-papa', household_id: 'p-home', user_id: 'p-u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 },
  { id: 'p-mama', household_id: 'p-home', user_id: 'p-u2', name: 'Мама', color: '#E0457B', role: 'parent', is_owner: false, portion: 1 },
  { id: 'p-son', household_id: 'p-home', user_id: 'p-u3', name: 'Сын', color: '#1FA463', role: 'child', is_owner: false, portion: 1 },
  { id: 'p-dima', household_id: 'p-home', user_id: null, name: 'Дима', color: '#F2A900', role: 'child', is_owner: false, portion: 0.5 },
];
const db = createLocalDb('family-app-preview');

const shiftMonthKey = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

async function seed() {
  const now = '2026-10-13T00:00:00Z';
  const recipes: Recipe[] = []; const rows: RecipeIngredient[] = [];
  for (const file of Object.values(recipeFiles)) {
    for (const r of file.recipes) {
      recipes.push({ id: r.id, household_id: null, name: r.name, about: r.about ?? '', category: r.category, meals: r.meals, time_active: r.time.active, time_total: r.time.total,
        servings: r.servings, keeps_days: r.keepsDays ?? 1, protein: r.protein, tags: r.tags ?? [], season: r.season === 'any' || !r.season ? ['any'] : r.season,
        collections: r.collections ?? [], dima_level: r.dima.level, dima_note: r.dima.note ?? '', steps: r.steps, source_url: r.source?.url ?? null, source_site: r.source?.site ?? null, updated_at: now, deleted_at: null });
      r.ingredients.forEach((i: Json, pos: number) => rows.push({ recipe_id: r.id, pos, item: i.item, qty: i.qty ?? null, to_taste: !!i.toTaste, note: i.note ?? '', optional: !!i.optional }));
    }
  }
  const slots: TemplateSlot[] = [];
  for (const w of weeksJson as Json[]) {
    w.days.forEach((d: Json, day: number) => {
      const lunch = d.lunch ?? {}; const dinner = d.dinner ?? {}; const snack = d.snack;
      const add = (meal: TemplateSlot['meal'], dish: string | null, side: string | null, salad: string | null, simple: TemplateSlot['simple']) =>
        slots.push({ template_id: w.id, day, meal, dish_id: dish, side_id: side, salad_id: salad, simple, updated_at: now });
      add('breakfast', d.breakfast ?? null, null, null, null);
      add('lunch', lunch.soup ?? null, null, lunch.salad ?? null, null);
      add('snack', typeof snack === 'string' ? snack : null, null, null, typeof snack === 'object' ? snack : null);
      add('dinner', dinner.main ?? null, dinner.side ?? null, dinner.salad ?? null, null);
    });
  }
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
    await db.recipes.bulkPut(recipes);
    await db.recipe_ingredients.bulkPut(rows);
    await db.ingredients.bulkPut((ingredientsJson as Json[]).map((v) => ({ item: v.item, unit: v.unit, dept: v.dept, grp: v.group, piece_weight: v.pieceWeight ?? null, piece_name: v.pieceName ?? null, pantry: !!v.pantry })));
    await db.prices.bulkPut((pricesJson as Json).prices.map((p: Json) => ({ item: p.item, price_per_unit: p.pricePerUnit, source: p.source, note: p.note ?? null, collected: (pricesJson as Json).collected })));
    await db.week_templates.bulkPut((weeksJson as Json[]).map((w) => ({ id: w.id, household_id: null, name: w.name, season: w.season === 'any' || !w.season ? ['any'] : w.season, note: w.note ?? '', updated_at: now, deleted_at: null })));
    await db.template_slots.bulkPut(slots);
    const start = mondayOf(new Date());
    await db.weeks.put({ id: 'p-week', household_id: 'p-home', starts_on: start, template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: 'p-papa', updated_at: now, deleted_at: null });
    await db.week_slots.bulkPut(slots.filter((s) => s.template_id === 'autumn').map(({ template_id, ...s }): WeekSlot => ({ ...s, week_id: 'p-week', household_id: 'p-home' })));
    await db.weeks.put({ id: 'p-next', household_id: 'p-home', starts_on: addDaysIso(start, 7), template_id: 'quick', status: 'proposed', proposed_by: 'p-son', approved_by: null, updated_at: now, deleted_at: null });
    await db.week_slots.bulkPut(slots.filter((s) => s.template_id === 'quick').map(({ template_id, ...s }): WeekSlot => ({ ...s, week_id: 'p-next', household_id: 'p-home' })));
    await db.votes.put({ week_id: 'p-next', member_id: 'p-son', household_id: 'p-home', value: 'yes', comment: '', updated_at: now });
    const today = addDaysIso(start, dayOfWeek(new Date()));
    await db.dish_offers.put({ id: 'p-offer', household_id: 'p-home', from_member: 'p-mama', to_member: 'p-papa', dish_id: 'ex-shakshuka', on_date: today, meal: 'dinner', how: 'over', status: 'open', taken_by: null, updated_at: now, deleted_at: null });
    await db.shopping_items.put({ id: 'u:p-milk', household_id: 'p-home', week_id: null, offer_id: null, source: 'manual', item: 'молоко', title: 'Молоко', qty: null, unit: null, qty_text: '2 л', dept: 'Молочное и яйца', urgent: true, est_price: null, added_by: 'p-mama', updated_at: now, deleted_at: null });
    // The board, as in the chosen mockups.
    const h = 'p-home';
    await db.wishes.bulkPut([
      { id: 'pw1', household_id: h, owner_id: 'p-son', title: 'Велосипед', price: 25000, saved: 8000, done_at: null, created_by: 'p-son', updated_at: now, deleted_at: null },
      { id: 'pw2', household_id: h, owner_id: 'p-mama', title: 'Роллы в пятницу', price: 2800, saved: 0, done_at: null, created_by: 'p-mama', updated_at: now, deleted_at: null },
      { id: 'pw3', household_id: h, owner_id: 'p-dima', title: 'Самокат', price: 4500, saved: 0, done_at: null, created_by: 'p-mama', updated_at: now, deleted_at: null },
    ]);
    await db.wish_metoo.put({ wish_id: 'pw2', member_id: 'p-papa', household_id: h, updated_at: now, deleted_at: null });
    await db.wish_gifts.put({ wish_id: 'pw3', giver_id: 'p-mama', household_id: h, updated_at: now, deleted_at: null });
    await db.needs.bulkPut([
      { id: 'pn1', household_id: h, for_id: 'p-son', title: 'Зимние ботинки', note: 'размер 37', due_on: '2026-11-01', price: 6000, created_by: 'p-mama', updated_at: now, deleted_at: null },
      { id: 'pn2', household_id: h, for_id: null, title: 'Лампа в коридор', note: '', due_on: null, price: 1200, created_by: 'p-papa', updated_at: now, deleted_at: null },
    ]);
    await db.goals.bulkPut([
      { id: 'pg1', household_id: h, owner_id: null, title: 'Море летом', target: 120000, saved: 40000, steps: [{ id: 'a', t: 'Выбрать место', done: true }, { id: 'b', t: 'Накопить на билеты', done: false }, { id: 'c', t: 'Забронировать жильё', done: false }], created_by: 'p-papa', updated_at: now, deleted_at: null },
      { id: 'pg2', household_id: h, owner_id: 'p-son', title: 'Новый велосипед', target: 25000, saved: 8000, steps: [], created_by: 'p-son', updated_at: now, deleted_at: null },
    ]);
    const todayIso = addDaysIso(start, dayOfWeek(new Date()));
    await db.requests.bulkPut([
      { id: 'pr1', household_id: h, from_id: 'p-mama', to_id: 'p-papa', title: 'Купить молоко и хлеб', due_on: todayIso, urgent: true, status: 'open', done_at: null, updated_at: now, deleted_at: null },
      { id: 'pr2', household_id: h, from_id: 'p-son', to_id: 'p-papa', title: 'Помочь с проектом по физике', due_on: addDaysIso(todayIso, 2), urgent: false, status: 'open', done_at: null, updated_at: now, deleted_at: null },
      { id: 'pr3', household_id: h, from_id: 'p-papa', to_id: 'p-son', title: 'Выучить стих к пятнице', due_on: addDaysIso(todayIso, 1), urgent: false, status: 'open', done_at: null, updated_at: now, deleted_at: null },
    ]);
    // Money for parents, from the mockup's October.
    const pay = (id: string, title: string, amount: number, day: number, extra: Record<string, unknown> = {}) =>
      ({ id, household_id: h, title, amount, day, kind: 'monthly' as const, total: null, first_month: null, note: '', created_by: 'p-papa', updated_at: now, deleted_at: null, ...extra });
    await db.payments.bulkPut([
      pay('pp1', 'Аренда квартиры', 45000, 1), pay('pp2', 'Рассрочка: стиральная машина', 6200, 5, { kind: 'installment', total: 12, first_month: shiftMonthKey(-2) }),
      pay('pp3', 'Коммуналка', 7800, 10), pay('pp4', 'Интернет и ТВ', 650, 16), pay('pp5', 'Плавание, Сын', 4500, 20), pay('pp6', 'Мобильная связь', 1200, 28),
    ]);
    const month = todayIso.slice(0, 7);
    await db.payment_marks.bulkPut(['pp1', 'pp2', 'pp3'].map((id, i) => ({ payment_id: id, month, household_id: h, paid: true, amount: [45000, 6200, 7800][i], paid_by: i ? 'p-mama' : 'p-papa', paid_on: `${month}-0${i + 1}`, updated_at: now })));
    const spend = (id: string, amount: number, category: string, who: string) => ({ id, household_id: h, kind: 'expense' as const, amount, category, member_id: who, on_date: `${month}-0${(Number(id.slice(2)) % 9) + 1}`, note: '', created_by: who, updated_at: now, deleted_at: null });
    await db.money_entries.bulkPut([
      spend('pe1', 18400, 'Продукты', 'p-mama'), spend('pe2', 6300, 'Дети', 'p-mama'), spend('pe3', 3900, 'Транспорт', 'p-papa'),
      spend('pe4', 2800, 'Кафе и доставка', 'p-papa'), spend('pe5', 1700, 'Дом', 'p-mama'),
      { id: 'pe6', household_id: h, kind: 'income', amount: 185000, category: null, member_id: 'p-papa', on_date: `${month}-05`, note: '', created_by: 'p-papa', updated_at: now, deleted_at: null },
    ]);
    await db.meta.put({ key: 'family_portions', value: 3.5 });
    await db.meta.put({ key: 'content_loaded_at', value: new Date().toISOString() });
  });
  await regenerateWeekList(db, 'p-week');
  await db.outbox.clear();
}

// A stand-in photo for story screens: a gradient with a horizon, drawn once.
function samplePhoto(): string {
  const c = Object.assign(document.createElement('canvas'), { width: 900, height: 1200 });
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 1200);
  sky.addColorStop(0, '#F7B267'); sky.addColorStop(0.55, '#F4845F'); sky.addColorStop(0.56, '#2E4057'); sky.addColorStop(1, '#1B2838');
  g.fillStyle = sky; g.fillRect(0, 0, 900, 1200);
  g.fillStyle = '#FFE66D'; g.beginPath(); g.arc(450, 600, 120, Math.PI, 0); g.fill();
  return c.toDataURL('image/jpeg', 0.9);
}
const SAMPLE_OVERLAYS: Overlay[] = [
  { id: 'o1', type: 'text', text: 'Закат на даче', x: 0.5, y: 0.22, scale: 0.09, rotation: -4, color: '#FFFFFF', style: 'plain' },
  { id: 'o2', type: 'text', text: 'Ужин в 19:00!', x: 0.5, y: 0.78, scale: 0.07, rotation: 0, color: '#C92A62', style: 'box' },
  { id: 'o3', type: 'emoji', char: '🔥', x: 0.82, y: 0.36, scale: 0.18, rotation: 12 },
];
const story = (id: string, member: string, hoursAgo: number, overlays: Overlay[]): Story => ({
  id, household_id: 'p-home', member_id: member, kind: 'photo', path: `p-home/stories/${id}.jpg`, width: 900, height: 1200, duration_ms: null, overlays,
  created_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(), expires_at: new Date(Date.now() + (24 - hoursAgo) * 3600_000).toISOString(),
});

function StoriesPreview({ edit }: { edit: boolean }) {
  const [src] = useState(samplePhoto);
  const [now] = useState(() => new Date());
  const [stories] = useState(() => [story('s1', 'p-mama', 2, SAMPLE_OVERLAYS), story('s2', 'p-mama', 1, [])]);
  if (edit) return <StoryEditor kind="photo" src={src} initial={SAMPLE_OVERLAYS} status="Отправляем…" publishLabel="Опубликовать" error="" onPublish={async () => {}} onClose={() => {}} />;
  return (
    <StoryViewer groups={[{ memberId: 'p-mama', stories }]} start={{ g: 0, i: 0 }} me={PREVIEW_MEMBERS[0]} members={PREVIEW_MEMBERS} now={now}
      views={[{ story_id: 's1', member_id: 'p-papa', viewed_at: '', reaction: '❤️' }]} urls={new Map(stories.map((s) => [s.path, src]))}
      onViewed={() => {}} onReact={() => {}} onClose={() => {}} onOwn={{ viewers: () => {}, edit: () => {}, remove: () => {}, more: () => {} }} />
  );
}

// Rings on the family row without a database: Mama has a new story, Son one already seen.
const PREVIEW_STORIES = { available: true, ringOf: (id: string) => (id === 'p-mama' ? 'unseen' : id === 'p-son' ? 'seen' : 'none') as 'unseen' | 'seen' | 'none', openViewer: () => {}, compose: () => {} };

export default function Preview() {
  const [ready, setReady] = useState(false);
  const [asChild, setChild] = useState(false);
  useEffect(() => { seed().then(() => setReady(true)); }, []);
  useEffect(() => { setChild(new URLSearchParams(location.search).get('as') === 'son'); }, []);
  if (!ready) return <p className="note" style={{ margin: 16 }}>Готовим превью…</p>;
  const me = asChild ? PREVIEW_MEMBERS[2] : PREVIEW_MEMBERS[0];
  return (
    <>
      <div className="screen">
        <Routes>
          <Route path="/dev" element={<StoriesContext.Provider value={PREVIEW_STORIES}><HomePage me={me} members={PREVIEW_MEMBERS} db={db} /></StoriesContext.Provider>} />
          <Route path="/dev/story" element={<StoriesPreview edit={false} />} />
          <Route path="/dev/story-edit" element={<StoriesPreview edit />} />
          <Route path="/dev/menu" element={<MenuPage me={me} members={PREVIEW_MEMBERS} db={db} />} />
          <Route path="/dev/shop" element={<ShopPage me={me} members={PREVIEW_MEMBERS} db={db} />} />
          <Route path="/dev/board" element={<BoardPage me={me} members={PREVIEW_MEMBERS} db={db} />} />
          <Route path="/dev/money" element={<MoneyPage me={me} members={PREVIEW_MEMBERS} db={db} />} />
          <Route path="/dev/recipe-new" element={<RecipeEditor me={me} db={db} onClose={() => {}} />} />
          <Route path="/dev/recipe-edit" element={<RecipeEditor me={me} db={db} onClose={() => {}} draft={{
            ...emptyDraft(), id: 'own-x', name: 'Мамины сырники', about: 'С изюмом, как в детстве', category: 'breakfast', time: '25', servings: '4', dima: 'adapt', dimaNote: 'Без изюма',
            rows: [{ item: 'творог', qty: '500', toTaste: false, note: '' }, { item: 'яйца', qty: '2', toTaste: false, note: '' }, { item: 'соль', qty: '', toTaste: true, note: '' }],
            steps: ['Размять творог с яйцами и сахаром.', 'Слепить сырники, обвалять в муке.', 'Обжарить по 3 минуты с каждой стороны.'],
          }} />} />
        </Routes>
      </div>
      <TabBar tabs={['home', 'menu', 'shop']} />
    </>
  );
}
