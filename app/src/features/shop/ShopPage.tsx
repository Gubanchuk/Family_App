import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToday } from '../../lib/useToday';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../shell/Header';
import { useSync } from '../../data/SyncProvider';
import Icon from '../shell/Icon';
import { localDb, type LocalDb, type ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import { weekLabel } from '../menu/week';
import { listTotals, rub } from './build';
import { closed, groupByDept, useShop, visibleItems } from './useShop';
import { setAtHome, stockKey } from './stock';
import { addManualItem, endTrip, goShopping, removeItem, setBought, setRealPrice } from './shopActions';
import { activeTrips, cartRows } from './tripCart';
import TripSheet from './TripSheet';
import { listText } from './listText';
import AddItemSheet from './AddItemSheet';
import ItemSheet from './ItemSheet';
import HomePanel from './HomePanel';
import { useToast } from '../shell/toastContext';
import { capitalize } from './menuList';
import ListDays from './ListDays';
import { useFeature } from '../../data/useFeature';
import { setListDays } from '../menu/weekActions';
import { dayOfWeek } from '../menu/week';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
type Clip = { writeText: (t: string) => Promise<void> };

export default function ShopPage({ me, members, db = localDb, today: fixedToday, clipboard }: { me: Member; members: Member[]; db?: LocalDb; today?: Date; clipboard?: Clip }) {
  const today = useToday(fixedToday);
  const data = useShop(db, me.household_id, today);
  const sync = useSync();
  const vocab = useLiveQuery(async () => new Map((await db.ingredients.toArray()).map((v) => [v.item, v])), [db]);
  // Home's «Добавить» → «В покупки» opens the list with the add form (?add=1); a just-approved week links to its own list (?week=).
  const [params, setParams] = useSearchParams();
  const [weekPick, setWeekPick] = useState<string | null>(params.get('week'));
  const [sheet, setSheet] = useState<'add' | ShoppingItem | null>(params.get('add') === '1' ? 'add' : null);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  // In the shop with a cart: the cart first, the whole list a tap away.
  const [cartView, setCartView] = useState(true);
  const toast = useToast();
  const folds = useFolds();
  const hasDays = useFeature(db, 'listDays');
  const hasHome = useFeature(db, 'homeCart');
  // A linked week that is no longer in the list falls back to the first one.
  const weekId = data?.weeks.find((w) => w.id === weekPick)?.id ?? data?.weeks[0]?.id ?? null;
  const shown = useMemo(() => {
    if (!data) return [];
    const weekStart = data.weeks.find((w) => w.id === weekId)?.starts_on ?? data.start;
    return visibleItems(data.items, weekId, { weekStart, marks: data.marks, offers: data.offers });
  }, [data, weekId]);
  if (!data) return <><Header title="Покупки" /><p className="note" style={{ margin: 16 }}>Загружаем список…</p></>;

  const { marks } = data;
  // Who is in the shop now; my own trip may carry a cart.
  const active = activeTrips(data.trips, today);
  const mine = active.find((t) => t.member_id === me.id);
  const others = active.filter((t) => t.member_id !== me.id);
  // The cart reads every line, not only the week tab that happens to be open.
  const cart = hasHome && mine?.items ? cartRows(mine, data.items, marks) : null;
  const inCart = cart && cartView;
  const extra = new Map((cart ?? []).map((r) => [r.item.id, r]));
  const list = inCart ? cart.map((r) => r.item) : shown;
  const totals = listTotals(list.map((i) => ({ est: i.est_price, real: marks.get(i.id)?.price_real ?? null, bought: !!marks.get(i.id)?.bought, home: !!marks.get(i.id)?.at_home })));
  // Products marked «есть» since a line was listed: the line says so, the person decides. An older «есть»
  // (bought last week) says nothing about this week, so it gives no hint.
  const atHome = new Map(data.stock.filter((s) => s.state === 'have').map((s) => [s.key, s.updated_at]));
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const added = (id: string | null) => {
    const m = members.find((x) => x.id === id);
    return `${m && ['mother', 'grandmother', 'daughter'].includes(m.kin ?? '') ? 'добавила' : 'добавил'} ${name(id)}`;
  };
  const week = data.weeks.find((w) => w.id === weekId);
  // The dish is named once its offer and recipe are on this phone.
  const offered = (i: ShoppingItem) => {
    const o = i.offer_id ? data.offers.get(i.offer_id) : undefined;
    const dish = o ? data.dishes.get(o.dish_id) : undefined;
    return dish ? `к блюду «${dish}»` : 'к предложенному блюду';
  };
  const origin = (i: ShoppingItem) => (i.source === 'menu' ? 'из меню' : i.source === 'offer' ? offered(i) : i.source === 'home' ? `закончилось дома · ${name(i.added_by)}` : `вручную · ${name(i.added_by)}`);

  // Urgent lines still to buy get their own card on top; once bought they go back to their department.
  const urgent = inCart ? [] : shown.filter((i) => i.urgent && !closed(marks.get(i.id)));
  const urgentIds = new Set(urgent.map((i) => i.id));
  const row = (i: ShoppingItem) => {
    const m = marks.get(i.id);
    const done = !!m?.bought;
    // Kept «at home»: closed without buying; a tap puts it back on the list.
    const home = !!m?.at_home;
    const price = m?.price_real ?? i.est_price;
    const since = atHome.get(stockKey(i));
    const hint = !done && !home && since && since > (i.created_at ?? i.updated_at) ? 'дома есть' : '';
    // In the cart a line says how much the chosen meals need, or who added it from home.
    const c = inCart ? extra.get(i.id) : undefined;
    const sub = c ? c.hint ?? (c.addedBy ? added(c.addedBy) : origin(i)) : origin(i);
    return (
      <div className={`row ${done || home ? 'done' : ''}`} key={i.id}>
        <button type="button" className="row-btn" aria-pressed={done} aria-label={`${i.title}${i.qty_text ? `, ${i.qty_text}` : ''}${i.urgent ? ', срочно' : ''}${home ? ', есть дома' : ''}`}
          onClick={() => (home ? setAtHome(db, i, me, false, m) : setBought(db, i, me, !done, m, hasHome && vocab ? { vocab } : undefined))}>
          <span className="check" aria-hidden="true"><Icon name="check" /></span>
          <span className="row-main"><b>{i.title}</b><small>{home ? 'есть дома' : [i.qty_text, sub, hint].filter(Boolean).join(' · ')}</small></span>
          {i.urgent ? <span className="pill">срочно</span> : null}
        </button>
        <button type="button" className="amount amount-btn" aria-label={`${i.title}: ${price !== null ? `цена ${rub(price)}` : 'цена не указана'}`} onClick={() => setSheet(i)}>{price !== null ? rub(price) : '—'}</button>
      </div>
    );
  };

  // «Список · Дома», once the server keeps what is at home (?view=home).
  const view = hasHome && params.get('view') === 'home' ? 'home' : 'list';
  const views = hasHome ? (
    <div className="segs" role="tablist" aria-label="Покупки">
      <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => setParams({}, { replace: true })}>Список</button>
      <button type="button" role="tab" aria-selected={view === 'home'} onClick={() => setParams({ view: 'home' }, { replace: true })}>Дома</button>
    </div>
  ) : null;
  if (view === 'home') {
    return (
      <>
        <Header title="Покупки" subtitle="Что есть дома" />
        {views}
        <HomePanel db={db} me={me} stock={data.stock} vocab={vocab ?? new Map()} items={shown} marks={marks}
          weekStart={data.weeks.find((w) => w.id === weekId)?.starts_on ?? data.start} />
      </>
    );
  }

  const copy = async () => {
    const text = listText(week ? `Покупки на ${weekLabel(week.starts_on)}` : 'Покупки', shown.filter((i) => !closed(marks.get(i.id))));
    const clip = clipboard ?? navigator.clipboard;
    try { await clip.writeText(text); setNote('Список скопирован'); } catch { setNote('Не получилось скопировать. Выделите список вручную.'); }
  };

  return (
    <>
      <Header title="Покупки" subtitle={`Отмечено ${totals.doneCount} из ${totals.count}`}
        action={<button type="button" className="head-pill" onClick={() => setSheet('add')}><Icon name="plus" />Добавить</button>} />
      {views}
      {others.length ? (
        <section className="notice" aria-live="polite"><span className="row-main">
          {others.map((t) => <b key={t.id}>{`${name(t.member_id)} в магазине с ${hhmm(t.started_at)}${t.label ? `: ${t.label}` : ''}`}</b>)}
          <small>Добавьте, что нужно купить.</small>
        </span></section>
      ) : null}
      {data.weeks.length > 1 && !inCart ? (
        <div className="segs" role="tablist" aria-label="Неделя">
          {data.weeks.map((w) => <button key={w.id} type="button" role="tab" aria-selected={w.id === weekId} onClick={() => setWeekPick(w.id)}>{weekLabel(w.starts_on)}</button>)}
        </div>
      ) : null}
      {week && hasDays && me.role === 'parent' && !inCart ? (
        <ListDays key={`${week.id}-${(week.list_days ?? []).join()}`} week={week} today={week.starts_on === data.start ? dayOfWeek(today) : null}
          onSave={(days) => setListDays(db, week, days)} />
      ) : null}
      {sync.message ? (
        <section className="notice" role="alert"><span className="row-main"><b>{sync.message}</b></span>
          <button type="button" className="btn soft sm" onClick={sync.dismiss}>Понятно</button></section>
      ) : null}
      <div className="btns fill" style={{ margin: '0 16px 14px' }}>
        {mine && hasHome ? (
          <button type="button" className="btn" onClick={() => endTrip(db, mine)}><Icon name="check" />Закончить поход</button>
        ) : (
          <button type="button" className="btn" disabled={!!mine} onClick={() => (hasHome ? setPicking(true) : goShopping(db, me, today))}><Icon name="bag" />{mine ? 'Вы в магазине' : 'Иду в магазин'}</button>
        )}
        <button type="button" className="btn soft" onClick={copy}><Icon name="copy" />Скопировать</button>
      </div>
      {note ? <p className="note" role="status" style={{ margin: '0 16px 12px' }}>{note}</p> : null}
      {cart ? (
        <div className="segs" role="tablist" aria-label="Что показать">
          <button type="button" role="tab" aria-selected={cartView} onClick={() => setCartView(true)}>Корзина</button>
          <button type="button" role="tab" aria-selected={!cartView} onClick={() => setCartView(false)}>Весь список</button>
        </div>
      ) : null}
      {inCart && list.length === 0 ? (
        <section className="card"><p className="note" style={{ margin: 0 }}>В корзине ничего не осталось. Всё остальное — во «Весь список».</p></section>
      ) : list.length === 0 ? (
        <section className="card"><p className="note" style={{ margin: 0 }}>Список соберётся сам, когда родитель утвердит неделю в Меню. Срочное можно добавить вручную.</p></section>
      ) : (
        <>
          <div className="bento"><div className="tile wide" style={{ ['--h' as string]: 'var(--k-shop)', cursor: 'default' }}>
            <span className="t-k"><Icon name="cart" />Куплено на {rub(totals.bought)}</span>
            <span className="t-v">Осталось ≈&nbsp;{rub(totals.left)}{totals.unpriced ? ` · ${totals.unpriced} без цены` : ''}</span>
            <span className="bar" aria-hidden="true"><i style={{ width: `${totals.bought + totals.left ? (totals.bought / (totals.bought + totals.left)) * 100 : 0}%` }} /></span>
          </div></div>
          {urgent.length ? (
            <section className="card urgent-card" aria-label="Срочно">
              <div className="card-h"><h2>Срочно</h2><span className="note" style={{ margin: 0 }}>{urgent.length}</span></div>
              {urgent.map(row)}
            </section>
          ) : null}
          {groupByDept(list.filter((i) => !urgentIds.has(i.id)), marks).map((g) => {
            const id = `dept-${g.dept.replace(/\s+/g, '-')}`;
            const got = g.items.filter((i) => closed(marks.get(i.id))).length;
            const done = got === g.items.length;
            const folded = folds.isFolded(g.dept, done);
            // What the department costs: what is left to buy, or what it took once all is bought.
            const sum = listTotals(g.items.map((i) => ({ est: i.est_price, real: marks.get(i.id)?.price_real ?? null, bought: !!marks.get(i.id)?.bought, home: !!marks.get(i.id)?.at_home })));
            const money = done ? (sum.bought ? rub(sum.bought) : '') : sum.left ? `≈ ${rub(sum.left)}` : '';
            return (
              <section className="card" key={g.dept} aria-labelledby={id}>
                <div className="card-h dept-h">
                  <h2 id={id}><button type="button" className="dept-toggle" aria-expanded={!folded} aria-controls={`${id}-rows`} onClick={() => folds.toggle(g.dept, done)}>{g.dept}<Icon name="chev" /></button></h2>
                  {/* Two short lines on the right, so the department name keeps the left side whole. */}
                  <span className="dept-meta"><span>{folded ? (done ? 'всё куплено' : `осталось ${g.items.length - got}`) : `${got} из ${g.items.length}`}</span>{money ? <span>{money}</span> : null}</span>
                </div>
                {folded ? null : <div id={`${id}-rows`}>{g.items.map(row)}</div>}
              </section>
            );
          })}
        </>
      )}
      {sheet === 'add' && vocab ? <AddItemSheet vocab={vocab} onClose={() => { setSheet(null); if (params.get('add')) setParams({}, { replace: true }); }} onAdd={async (a) => {
        const dept = await addManualItem(db, me, { ...a, vocab });
        const title = capitalize(a.title.trim());
        toast({ text: a.urgent ? `«${title}» — в «Срочно» наверху списка` : `«${title}» в списке, отдел «${dept}»` });
      }} /> : null}
      {picking && vocab ? (
        <TripSheet db={db} me={me} weeks={data.weeks} base={data.start} today={dayOfWeek(today)} lines={shown} marks={marks} vocab={vocab}
          cartLines={[...new Map(data.weeks.flatMap((w) => visibleItems(data.items, w.id, { weekStart: w.starts_on, marks, offers: data.offers })).map((i) => [i.id, i])).values()]}
          onStart={(c) => goShopping(db, me, today, c).then(() => setCartView(true))} onClose={() => setPicking(false)} />
      ) : null}
      {sheet && sheet !== 'add' ? (
        <ItemSheet item={sheet} mark={marks.get(sheet.id)} onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))} onRemove={() => removeItem(db, sheet)}
          onHome={hasHome ? (on) => setAtHome(db, sheet, me, on, marks.get(sheet.id)) : undefined} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}

// A long department folds to its count with a tap on its name; the choice stays on this phone.
// A department where everything is bought folds by itself, unless opened again.
const FOLD_KEY = 'fa.shop-folded';
function useFolds() {
  const [folded, setFolded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const isFolded = (dept: string, done: boolean) => folded.has(dept) || (done && !opened.has(dept));
  const toggle = (dept: string, done: boolean) => {
    const f = new Set(folded);
    const o = new Set(opened);
    if (isFolded(dept, done)) { f.delete(dept); o.add(dept); } else { f.add(dept); o.delete(dept); }
    setFolded(f);
    setOpened(o);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...f])); } catch { /* storage unavailable */ }
  };
  return { isFolded, toggle };
}
