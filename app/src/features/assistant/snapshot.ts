import type { LocalDb, Recipe, ShoppingItem, ShoppingMark, Week, WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import { KIN_WORD } from '../family/kin';
import { addDaysIso, dayOfWeek, MEAL_LABEL, MEALS, mondayOf, weekLabel } from '../menu/week';
import { deptRank } from '../shop/build';
import { activeTrips } from '../shop/tripCart';
import { savedIn, bankOf } from '../board/boardMath';
import { needState } from '../board/needToShop';
import { whenText as dueWhen } from '../board/requestText';
import { CATEGORIES } from '../money/types';
import { dayTitle, daysTo, dueText, incomeOf, monthKey, monthPayments, monthTitle, shiftMonth, shopSpend, spendByCategory } from '../money/month';

// The «снимок семьи»: what this member sees in the app, as compact Russian text for the assistant.
// Sections appear only when they have something in them; recipes are not here (the model searches them).

const WEEKDAY = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const SCREEN: Record<string, string> = { home: 'Главная', menu: 'Меню', shop: 'Покупки', board: 'Доска', money: 'Деньги' };
const LIST_MAX = 80;
const HOME_MAX = 150;

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
// Plain spaces, unlike rub() on screen: the model reads it, nobody wraps it.
export const rubs = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);
const capped = (list: string[], max: number) => (list.length > max ? [...list.slice(0, max), `и ещё ${list.length - max}`] : list);

export function whoIs(m: Member): string {
  const parts = [m.kin ? KIN_WORD[m.kin] : null, m.role === 'parent' ? 'родитель' : 'ребёнок'];
  if (!m.user_id) parts.push('без своего входа');
  if (m.portion !== 1) parts.push(m.portion === 0.5 ? 'полпорции' : `порция ${String(m.portion).replace('.', ',')}`);
  return parts.filter(Boolean).join(', ');
}

function slotLine(s: WeekSlot, recipes: Map<string, Recipe>): string | null {
  const main = s.dish_id ? recipes.get(s.dish_id)?.name ?? null : s.simple?.simple ?? null;
  if (!main) return null;
  const side = s.side_id ? recipes.get(s.side_id)?.name : undefined;
  const salad = s.salad_id ? recipes.get(s.salad_id)?.name : undefined;
  return `${main}${side ? ` + ${lowerFirst(side)}` : ''}${salad ? `, салат: ${lowerFirst(salad)}` : ''}`;
}

function weekSection(title: string, start: string, week: Week | undefined, slots: WeekSlot[], recipes: Map<string, Recipe>, fromDay: number, today: string): string[] {
  if (!week) return [`${title}: не составлено.`];
  const status = week.status === 'approved' ? 'утверждено' : 'предложено, ещё не утверждено';
  const days: string[] = [];
  for (let day = fromDay; day < 7; day += 1) {
    const date = addDaysIso(start, day);
    const meals = MEALS.flatMap((meal) => {
      const s = slots.find((x) => x.day === day && x.meal === meal);
      const line = s ? slotLine(s, recipes) : null;
      return line ? [`${MEAL_LABEL[meal].toLowerCase()} — ${line}`] : [];
    });
    if (meals.length) days.push(`- ${WD[day]} ${Number(date.slice(8, 10))}${date === today ? ' (сегодня)' : ''}: ${meals.join('; ')}`);
  }
  return days.length ? [`${title} (${weekLabel(start)}, ${status}):`, ...days] : [`${title} (${weekLabel(start)}, ${status}): блюда не выбраны.`];
}

export async function buildSnapshot(db: LocalDb, me: Member, members: Member[], today: Date, screen?: string): Promise<string> {
  const h = me.household_id;
  const todayIso = isoOf(today);
  const start = mondayOf(today);
  const nextStart = addDaysIso(start, 7);
  const name = (id: string | null | undefined) => members.find((m) => m.id === id)?.name ?? 'кто-то';

  const weekAt = (s: string) => db.weeks.where('[household_id+starts_on]').equals([h, s]).filter((w) => !w.deleted_at).first();
  const [week, nextWeek] = await Promise.all([weekAt(start), weekAt(nextStart)]);
  const slotsOf = async (w?: Week) => (w ? db.week_slots.where('week_id').equals(w.id).toArray() : []);
  const [slots, nextSlots, offersAll, itemsAll, stockAll, notEat, wishes, needs, goals, requests, deposits, trips] = await Promise.all([
    slotsOf(week), slotsOf(nextWeek),
    db.dish_offers.where('household_id').equals(h).toArray(),
    db.shopping_items.where('household_id').equals(h).toArray(),
    db.home_stock.where('household_id').equals(h).toArray(),
    db.not_eat.where('household_id').equals(h).toArray(),
    db.wishes.where('household_id').equals(h).toArray(),
    db.needs.where('household_id').equals(h).toArray(),
    db.goals.where('household_id').equals(h).toArray(),
    db.requests.where('household_id').equals(h).toArray(),
    db.deposits.where('household_id').equals(h).toArray(),
    db.shop_trips.where('household_id').equals(h).toArray(),
  ]);
  const offers = live(offersAll).filter((o) => o.status !== 'declined' && o.on_date >= todayIso).sort((a, b) => a.on_date.localeCompare(b.on_date));
  const ids = new Set<string>();
  for (const s of [...slots, ...nextSlots]) for (const id of [s.dish_id, s.side_id, s.salad_id]) if (id) ids.add(id);
  for (const o of offersAll) ids.add(o.dish_id);
  for (const x of notEat) if (x.kind === 'dish') ids.add(x.ref);
  const recipes = new Map((await db.recipes.bulkGet([...ids])).filter((r): r is Recipe => !!r).map((r) => [r.id, r]));

  const out: string[] = ['<снимок_семьи>'];
  out.push(`Спрашивает: ${me.name} (${whoIs(me)}).`);
  out.push('Семья:', ...members.map((m) => `- ${m.name} — ${whoIs(m)}`));
  out.push(`Сегодня: ${WEEKDAY[dayOfWeek(today)]}, ${dayTitle(todayIso)} ${today.getFullYear()}, время ${hhmm(today)}.`);
  if (screen && SCREEN[screen]) out.push(`Экран: ${SCREEN[screen]}.`);

  out.push('', ...weekSection('Меню этой недели', start, week, slots, recipes, dayOfWeek(today), todayIso));
  out.push(...weekSection('Меню следующей недели', nextStart, nextWeek, nextSlots, recipes, 0, todayIso));

  if (offers.length) {
    out.push('', 'Предложенные блюда:');
    for (const o of offers) {
      const dish = recipes.get(o.dish_id)?.name ?? 'блюдо';
      const how = o.how === 'over' ? 'поверх меню' : 'вместо блюда меню';
      const state = o.status === 'taken' ? `готовит ${name(o.taken_by)}` : `${name(o.from_member)} просит ${o.to_member ? name(o.to_member) : 'кого угодно'}, ждёт ответа`;
      out.push(`- ${dayTitle(o.on_date)}, ${MEAL_LABEL[o.meal].toLowerCase()}: ${dish} (${how}) — ${state}`);
    }
  }

  // The list as Покупки shows it: menu lines of the approved weeks, hand-added, home and offered lines.
  const markList = (await db.shopping_marks.bulkGet(itemsAll.map((i) => i.id))).filter((m): m is ShoppingMark => !!m);
  const marks = new Map(markList.map((m) => [m.item_id, m]));
  const listWeeks = [week, nextWeek].filter((w): w is Week => !!w && w.status === 'approved');
  const offerById = new Map(offersAll.map((o) => [o.id, o]));
  const open = live(itemsAll).filter((i) => {
    const m = marks.get(i.id);
    if (m?.bought || m?.at_home) return false;
    if (i.source === 'menu') return listWeeks.some((w) => w.id === i.week_id);
    if (i.source === 'offer') { const o = i.offer_id ? offerById.get(i.offer_id) : undefined; return !!o && !o.deleted_at && o.status !== 'declined'; }
    return true;
  }).sort((a, b) => Number(b.urgent) - Number(a.urgent) || deptRank(a.dept) - deptRank(b.dept) || a.title.localeCompare(b.title, 'ru'));
  const origin = (i: ShoppingItem) => {
    if (i.source === 'menu') return i.week_id === nextWeek?.id ? 'меню следующей недели' : 'меню';
    if (i.source === 'offer') { const o = i.offer_id ? offerById.get(i.offer_id) : undefined; return `к блюду «${(o && recipes.get(o.dish_id)?.name) ?? 'предложенному'}»`; }
    return i.source === 'home' ? `${name(i.added_by)}, закончилось дома` : name(i.added_by);
  };
  const active = activeTrips(trips, today);
  if (open.length || active.length) out.push('');
  if (open.length) {
    const sum = open.reduce((s, i) => s + (i.est_price ?? 0), 0);
    const unpriced = open.filter((i) => i.est_price === null).length;
    out.push(`Список покупок — не куплено (${open.length}, примерно ${rubs(sum)}${unpriced ? `, без цены ${unpriced}` : ''}):`);
    // «Поход»: the lines the family takes on the next trip to the shop.
    const trip = open.filter((i) => i.in_trip);
    if (trip.length) out.push(`В походе (ближайший поход в магазин): ${trip.length}, примерно ${rubs(trip.reduce((n, i) => n + (i.est_price ?? 0), 0))}. Такие строки помечены «в походе».`);
    out.push(...capped(open.map((i) => `- ${i.title}${i.qty_text ? ` ${i.qty_text}` : ''}${i.est_price !== null ? ` · ~${rubs(i.est_price)}` : ''} · ${origin(i)}${i.urgent ? ' · срочно' : ''}${i.in_trip ? ' · в походе' : ''}`), LIST_MAX));
  }
  for (const t of active) out.push(`В магазине сейчас: ${name(t.member_id)} (с ${hhmm(new Date(t.started_at))}${t.label ? `, «${t.label}»` : ''}).`);

  const stock = live(stockAll).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  const have = stock.filter((s) => s.state === 'have').map((s) => s.title);
  const gone = stock.filter((s) => s.state === 'out').map((s) => s.title);
  if (have.length || gone.length) out.push('');
  if (have.length) out.push(`Дома есть: ${capped(have, HOME_MAX).join(', ')}.`);
  if (gone.length) out.push(`Дома закончилось: ${capped(gone, HOME_MAX).join(', ')}.`);

  const board: string[] = [];
  const bank = bankOf(live(deposits));
  const wishLines = live(wishes).filter((w) => !w.done_at).map((w) => {
    const saved = savedIn(bank, w);
    const money = [w.price !== null ? rubs(w.price) : null, saved > 0 ? `в копилке ${rubs(saved)}` : null].filter(Boolean).join(', ');
    return `- ${w.title} (${name(w.owner_id)})${money ? ` — ${money}` : ''}`;
  });
  if (wishLines.length) board.push('Хотелки:', ...wishLines);
  const itemById = new Map(itemsAll.map((i) => [i.id, i]));
  const needLines = live(needs).flatMap((n) => {
    const state = needState(n, itemById, marks);
    if (state === 'bought') return [];
    const bits = [n.due_on ? dueWhen(n.due_on, todayIso) : null, n.price !== null ? `~${rubs(n.price)}` : null, state === 'in-shop' ? 'уже в покупках' : null, n.note || null].filter(Boolean);
    return [`- ${n.title}${n.for_id ? ` (для: ${name(n.for_id)})` : ''}${bits.length ? ` — ${bits.join(', ')}` : ''}`];
  });
  if (needLines.length) board.push('Надо купить:', ...needLines);
  const goalLines = live(goals).map((g) => {
    const done = g.steps.filter((s) => s.done).length;
    const next = g.steps.find((s) => !s.done);
    const steps = g.steps.length ? `, шагов сделано ${done} из ${g.steps.length}${next ? `, следующий: ${lowerFirst(next.t)}` : ''}` : '';
    return `- ${g.title} (${g.owner_id ? name(g.owner_id) : 'вся семья'}) — ${rubs(savedIn(bank, g)).replace(' ₽', '')} из ${rubs(g.target)}${steps}`;
  });
  if (goalLines.length) board.push('Цели:', ...goalLines);
  const ANSWER = { open: 'ждёт ответа', accepted: 'сделает', declined: 'не может' } as const;
  const reqLines = live(requests).filter((r) => r.status === 'open' || r.status === 'accepted' || r.status === 'declined').map((r) => {
    const bits = [ANSWER[r.status as keyof typeof ANSWER], r.due_on ? dueWhen(r.due_on, todayIso) : null, r.urgent ? 'срочно' : null].filter(Boolean);
    return `- ${name(r.from_id)} → ${name(r.to_id)}: «${r.title}» — ${bits.join(' · ')}`;
  });
  if (reqLines.length) board.push('Просьбы:', ...reqLines);
  if (board.length) out.push('', 'Доска:', ...board);

  const noItems = live(notEat).filter((x) => x.kind === 'item').map((x) => x.ref);
  const noDishes = live(notEat).filter((x) => x.kind === 'dish').map((x) => recipes.get(x.ref)?.name ?? x.ref);
  if (noItems.length || noDishes.length) {
    out.push('', `Не едим: ${[noItems.join(', '), noDishes.length ? `блюда: ${noDishes.join(', ')}` : ''].filter(Boolean).join('; ')}.`);
  }

  // Money only for parents; a child's phone has none anyway (the server does not send it).
  if (me.role === 'parent') out.push('', ...(await moneyLines(db, h, today, todayIso)));
  out.push('</снимок_семьи>');
  return out.join('\n');
}

async function moneyLines(db: LocalDb, h: string, today: Date, todayIso: string): Promise<string[]> {
  const month = monthKey(today);
  const [payments, payMarks, entries, items, shopMarks, budgets] = await Promise.all([
    db.payments.where('household_id').equals(h).toArray(),
    db.payment_marks.where('household_id').equals(h).toArray(),
    db.money_entries.where('household_id').equals(h).filter((e) => !e.deleted_at).toArray(),
    db.shopping_items.where('household_id').equals(h).toArray(),
    db.shopping_marks.filter((m) => m.household_id === h).toArray(),
    db.budgets.where('household_id').equals(h).filter((b) => !b.deleted_at).toArray(),
  ]);
  const list = monthPayments(payments, payMarks, month);
  const all = [...entries, ...shopSpend(items, shopMarks)];
  const spent = spendByCategory(all, list, month);
  const income = incomeOf(entries, month);
  const budgetOf = new Map(budgets.map((b) => [b.category, b.amount]));
  const lines: string[] = [];
  const total = spent.reduce((s, c) => s + c.sum, 0);
  if (total || income) lines.push(`Потрачено за месяц: ${rubs(total)}${income ? `, доход ${rubs(income)}` : ''}.`);
  if (spent.length) lines.push(`По категориям: ${spent.map((c) => `${c.cat} ${rubs(c.sum)}${budgetOf.has(c.cat) ? ` из бюджета ${rubs(budgetOf.get(c.cat)!)}` : ''}`).join('; ')}.`);
  const idle = budgets.filter((b) => !spent.some((c) => c.cat === b.category));
  if (idle.length) lines.push(`Бюджеты без трат: ${idle.map((b) => `${b.category} ${rubs(b.amount)}`).join('; ')}.`);
  // Unpaid ones of this month, and next month's within a week (the reminder for the 1st comes on the 29th).
  const coming = [...list, ...monthPayments(payments, payMarks, shiftMonth(month, 1))]
    .filter((x) => !x.paid && !x.p.deleted_at && (x.month === month || daysTo(todayIso, x.due) <= 7));
  if (coming.length) lines.push(`Платежи к оплате: ${coming.map((x) => `${x.p.title} ${rubs(x.amount)} — ${dayTitle(x.due)}, ${dueText(daysTo(todayIso, x.due))}`).join('; ')}.`);
  const paid = list.filter((x) => x.paid);
  if (paid.length) lines.push(`Оплачено в этом месяце: ${paid.map((x) => `${x.p.title} ${rubs(x.amount)}`).join('; ')}.`);
  const head = lines.length ? [`Деньги за ${monthTitle(month).toLowerCase()} (видят только родители):`, ...lines] : [];
  return [...head, `Категории расходов: ${CATEGORIES.join(', ')}.`];
}

// FNV-1a over the text with the minutes taken out of the time: the snapshot goes again when the family's
// data changes or the hour turns, not on every question.
export function snapshotHash(text: string): string {
  const t = text.replace(/время (\d{1,2}):\d{2}/, 'время $1');
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i += 1) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, '0')}:${t.length.toString(36)}`;
}
