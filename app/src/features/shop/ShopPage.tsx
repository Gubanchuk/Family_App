import { useMemo, useState } from 'react';
import { useFolds } from './useFolds';
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
import TripView from './TripView';
import ProductPicker from './ProductPicker';
import { buildCatalog } from './catalog';
import { goods, pullToTrip, restoreLines, restoreRemoved, setInTrip, updateLine } from './tripActions';
import LineSheet from './LineSheet';
import { productOfLine } from './catalog';
import { joinSame, partsText, samePrice, type Same } from './sameProduct';
import SameSheet from './SameSheet';
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
  const prices = useLiveQuery(async () => new Map((await db.prices.toArray()).map((p) => [p.item, Number(p.price_per_unit)])), [db]);
  // Home's «Добавить» → «В покупки» opens the list with the add form (?add=1); a just-approved week links to its own list (?week=).
  const [params, setParams] = useSearchParams();
  const [weekPick, setWeekPick] = useState<string | null>(params.get('week'));
  const [sheet, setSheet] = useState<'add' | ShoppingItem | null>(params.get('add') === '1' ? 'add' : null);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  // In the shop with a cart: the cart first, the whole list a tap away.
  const [cartView, setCartView] = useState(true);
  // «Выбрать несколько»: lines picked for one action at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  // Bought and at-home lines fold into one card at the bottom.
  const [showDone, setShowDone] = useState(false);
  // A product listed more than once, opened to its parts.
  const [same, setSame] = useState<Same | null>(null);
  const toast = useToast();
  const folds = useFolds();
  const hasDays = useFeature(db, 'listDays');
  const hasHome = useFeature(db, 'homeCart');
  // «Поход», once the server keeps the trip mark on lines.
  const hasTrip = useFeature(db, 'tripList');
  const catalog = useMemo(() => (data && vocab ? buildCatalog({ vocab, prices: prices ?? new Map(), items: data.items, marks: data.marks }) : []), [data, vocab, prices]);
  // A linked week that is no longer in the list falls back to the first one.
  const weekId = data?.weeks.find((w) => w.id === weekPick)?.id ?? data?.weeks[0]?.id ?? null;
  const shown = useMemo(() => {
    if (!data) return [];
    const weekStart = data.weeks.find((w) => w.id === weekId)?.starts_on ?? data.start;
    return visibleItems(data.items, weekId, { weekStart, marks: data.marks, offers: data.offers });
  }, [data, weekId]);
  if (!data) return <><Header ask="shop" title="Покупки" /><p className="note" style={{ margin: 16 }}>Загружаем список…</p></>;

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
  // Who a line came from, in plain words; «вручную» is how the old list put it.
  const origin = (i: ShoppingItem) => (i.source === 'menu' ? 'из меню' : i.source === 'offer' ? offered(i) : i.source === 'home' ? `закончилось дома · ${name(i.added_by)}` : hasTrip ? name(i.added_by) : `вручную · ${name(i.added_by)}`);

  // Urgent lines still to buy get their own card on top; once bought they go back to their department.
  const urgentOwn = inCart ? [] : shown.filter((i) => i.urgent && !closed(marks.get(i.id)));
  // With the trip list, every open line of an urgent product joins it there, so the product shows once.
  const urgentKeys = new Set(urgentOwn.map((i) => stockKey(i)));
  const urgent = hasTrip ? shown.filter((i) => urgentKeys.has(stockKey(i)) && !closed(marks.get(i.id))) : urgentOwn;
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
    const label = `${i.title}${i.qty_text ? `, ${i.qty_text}` : ''}${i.urgent ? ', срочно' : ''}${home ? ', есть дома' : ''}`;
    const meta = <span className="row-main"><b>{i.title}</b><small>{home ? 'есть дома' : [i.qty_text, sub, hint, hasTrip && i.in_trip && !done ? 'в походе' : ''].filter(Boolean).join(' · ')}</small></span>;
    if (selecting) {
      const on = picked.has(i.id);
      return (
        <div className={`row ${on ? 'picked' : ''}`} key={i.id}>
          <button type="button" className="row-btn" aria-pressed={on} aria-label={`Выбрать: ${i.title}`} onClick={() => togglePick(i.id)}>
            <span className="check pick" aria-hidden="true"><Icon name="check" /></span>{meta}
          </button>
          <span className="amount">{price !== null ? rub(price) : ''}</span>
        </div>
      );
    }
    if (!hasTrip) {
      return (
        <div className={`row ${done || home ? 'done' : ''}`} key={i.id}>
          <button type="button" className="row-btn" aria-pressed={done} aria-label={label}
            onClick={() => (home ? setAtHome(db, i, me, false, m) : setBought(db, i, me, !done, m, hasHome && vocab ? { vocab } : undefined))}>
            <span className="check" aria-hidden="true"><Icon name="check" /></span>
            {meta}
            {i.urgent ? <span className="pill">срочно</span> : null}
          </button>
          <button type="button" className="amount amount-btn" aria-label={`${i.title}: ${price !== null ? `цена ${rub(price)}` : 'цена не указана'}`} onClick={() => setSheet(i)}>{price !== null ? rub(price) : '—'}</button>
        </div>
      );
    }
    const tick = async () => {
      if (home) { await setAtHome(db, i, me, false, m); return; }
      await setBought(db, i, me, !done, m, hasHome && vocab ? { vocab } : undefined);
      if (!done) toast({ text: `«${i.title}» — куплено`, action: { label: 'Вернуть', run: () => { void db.shopping_marks.get(i.id).then((x) => setBought(db, i, me, false, x)); } } });
    };
    return (
      <div className={`row ${done || home ? 'done' : ''}`} key={i.id}>
        <button type="button" className="check-btn" aria-pressed={done} aria-label={label} onClick={tick}>
          <span className="check" aria-hidden="true"><Icon name="check" /></span>
        </button>
        <button type="button" className="row-btn" aria-label={`${i.title}: открыть`} onClick={() => setSheet(i)}>
          {meta}
          {i.urgent && !done && !urgentIds.has(i.id) ? <span className="pill">срочно</span> : null}
        </button>
        <button type="button" className={`price-chip ${price === null ? 'empty' : ''}`} aria-label={`${i.title}: ${price !== null ? `цена ${rub(price)}, изменить` : 'указать цену'}`} onClick={() => setSheet(i)}>{price !== null ? rub(price) : '+ цена'}</button>
      </div>
    );
  };

  // «Поход · Список · Дома»: the trip first once the server keeps it (?view=list, ?view=home for the others).
  const asked = params.get('view');
  const view = hasHome && asked === 'home' ? 'home' : hasTrip && asked !== 'list' && params.get('add') !== '1' && !params.get('week') ? 'trip' : 'list';
  const views = hasHome || hasTrip ? (
    <div className="segs" role="tablist" aria-label="Покупки">
      {hasTrip ? <button type="button" role="tab" aria-selected={view === 'trip'} onClick={() => setParams({}, { replace: true })}>Поход</button> : null}
      <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => setParams(hasTrip ? { view: 'list' } : {}, { replace: true })}>{hasTrip ? 'Весь список' : 'Список'}</button>
      {hasHome ? <button type="button" role="tab" aria-selected={view === 'home'} onClick={() => setParams({ view: 'home' }, { replace: true })}>Дома</button> : null}
    </div>
  ) : null;
  // Every line the list shows in either week, for taking into the trip.
  const listLines = [...new Map((data.weeks.length ? data.weeks : [null]).flatMap((w) => visibleItems(data.items, w?.id ?? null, { weekStart: w?.starts_on ?? data.start, marks, offers: data.offers })).map((i) => [i.id, i])).values()];
  const copyLines = async (title: string, ls: ShoppingItem[]) => {
    const clip = clipboard ?? navigator.clipboard;
    try { await clip.writeText(listText(title, ls.filter((i) => !closed(marks.get(i.id))))); toast({ text: 'Список скопирован' }); } catch { toast({ text: 'Не получилось скопировать. Выделите список вручную.' }); }
  };
  if (view === 'trip' && vocab) {
    return (
      <>
        <Header ask="shop" title="Покупки" subtitle={mine ? `В магазине с ${hhmm(mine.started_at)} · отмечайте, что положили` : 'Что берём в магазин'} />
        {views}
        {sync.message ? (
          <section className="notice" role="alert"><span className="row-main"><b>{sync.message}</b></span>
            <button type="button" className="btn soft sm" onClick={sync.dismiss}>Понятно</button></section>
        ) : null}
        <TripView db={db} me={me} members={members} data={data} vocab={vocab} catalog={catalog} listLines={listLines} mine={mine} others={others}
          today={today} todayIdx={dayOfWeek(today)} hasHome={hasHome} onToast={toast} onCopy={(ls) => copyLines('Поход в магазин', ls)} />
      </>
    );
  }
  if (view === 'home') {
    return (
      <>
        <Header ask="shop" title="Покупки" subtitle="Что есть дома" />
        {views}
        <HomePanel db={db} me={me} stock={data.stock} vocab={vocab ?? new Map()} items={shown} marks={marks}
          weekStart={data.weeks.find((w) => w.id === weekId)?.starts_on ?? data.start} />
      </>
    );
  }

  const openList = list.filter((i) => !closed(marks.get(i.id)));
  const doneList = list.filter((i) => closed(marks.get(i.id)));
  const togglePick = (id: string) => setPicked((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // One row for a product listed more than once: one tick buys (or picks) all its parts; the name opens them.
  const sameRow = (s: Same) => {
    const first = s.lines[0];
    const all = s.lines.every((l) => closed(marks.get(l.id)));
    const price = samePrice(s, marks);
    const parts = partsText(s, origin);
    const meta = <span className="row-main"><b>{first.title}</b><small>{parts}</small></span>;
    if (selecting) {
      const on = s.lines.every((l) => picked.has(l.id));
      return (
        <div className={`row ${on ? 'picked' : ''}`} key={s.key}>
          <button type="button" className="row-btn" aria-pressed={on} aria-label={`Выбрать: ${first.title}`}
            onClick={() => setPicked((x) => { const n = new Set(x); for (const l of s.lines) { if (on) n.delete(l.id); else n.add(l.id); } return n; })}>
            <span className="check pick" aria-hidden="true"><Icon name="check" /></span>{meta}
          </button>
          <span className="amount">{price !== null ? rub(price) : ''}</span>
        </div>
      );
    }
    const tickAll = async () => {
      for (const l of s.lines) await setBought(db, l, me, !all, marks.get(l.id), hasHome && vocab ? { vocab } : undefined);
      if (!all) toast({ text: `«${first.title}» — куплено`, action: { label: 'Вернуть', run: () => { void (async () => { for (const l of s.lines) await setBought(db, l, me, false, await db.shopping_marks.get(l.id)); })(); } } });
    };
    return (
      <div className={`row ${all ? 'done' : ''}`} key={s.key}>
        <button type="button" className="check-btn" aria-pressed={all} aria-label={`${first.title}, ${parts}`} onClick={tickAll}>
          <span className="check" aria-hidden="true"><Icon name="check" /></span>
        </button>
        <button type="button" className="row-btn" aria-label={`${first.title}: открыть части`} onClick={() => setSame(s)}>{meta}</button>
        <button type="button" className={`price-chip ${price === null ? 'empty' : ''}`} aria-label={`${first.title}: части и цены`} onClick={() => setSame(s)}>{price !== null ? rub(price) : '+ цена'}</button>
      </div>
    );
  };
  // Without the trip column the list keeps one row per line, as before.
  const rows = (items: ShoppingItem[]) => (hasTrip ? joinSame(items, marks).map((s) => (s.lines.length === 1 ? row(s.lines[0]) : sameRow(s))) : items.map(row));
  const chosen = () => openList.filter((i) => picked.has(i.id));
  const finish = (text: string, run?: () => void) => { setSelecting(false); setPicked(new Set()); toast({ text, ...(run ? { action: { label: 'Вернуть', run } } : {}) }); };
  const buyPicked = async () => {
    const ls = chosen();
    for (const l of ls) await setBought(db, l, me, true, marks.get(l.id), hasHome && vocab ? { vocab } : undefined);
    finish(`Куплено: ${ls.length} ${goods(ls.length)} — траты записаны`, () => { void (async () => { for (const l of ls) await setBought(db, l, me, false, await db.shopping_marks.get(l.id)); })(); });
  };
  const tripPicked = async () => {
    const ls = chosen();
    const before = ls.map((l) => ({ ...l }));
    await pullToTrip(db, ls, catalog);
    finish(`В поход: ${ls.length} ${goods(ls.length)}`, () => { void restoreLines(db, before); });
  };
  const homePicked = async () => {
    const ls = chosen();
    for (const l of ls) await setAtHome(db, l, me, true, marks.get(l.id));
    finish(`Есть дома: ${ls.length} ${goods(ls.length)}`, () => { void (async () => { for (const l of ls) await setAtHome(db, l, me, false, await db.shopping_marks.get(l.id)); })(); });
  };
  const removePicked = async () => {
    const ls = chosen();
    for (const l of ls) await removeItem(db, l);
    const menu = ls.some((l) => l.source === 'menu');
    finish(`Убрали: ${ls.length} ${goods(ls.length)}${menu ? '. Строки меню вернутся, если поменяется меню' : ''}`, () => { void (async () => { for (const l of ls) await restoreRemoved(db, l); })(); });
  };

  const copy = async () => {
    const text = listText(week ? `Покупки на ${weekLabel(week.starts_on)}` : 'Покупки', shown.filter((i) => !closed(marks.get(i.id))));
    const clip = clipboard ?? navigator.clipboard;
    try { await clip.writeText(text); setNote('Список скопирован'); } catch { setNote('Не получилось скопировать. Выделите список вручную.'); }
  };

  return (
    <>
      <Header ask="shop" title="Покупки" subtitle={hasTrip ? 'Всё нужное: меню недели и добавленное' : `Отмечено ${totals.doneCount} из ${totals.count}`}
        action={hasTrip ? undefined : <button type="button" className="head-pill" onClick={() => setSheet('add')}><Icon name="plus" />Добавить</button>} />
      {views}
      {hasTrip && !selecting ? (
        <div className="trip-add">
          <button type="button" className="trip-search" onClick={() => setSheet('add')}><Icon name="plus" /><span>Найти и добавить товар</span></button>
        </div>
      ) : null}
      {others.length ? (
        <section className="notice" aria-live="polite"><span className="row-main">
          {others.map((t) => <b key={t.id}>{`${name(t.member_id)} в магазине с ${hhmm(t.started_at)}${t.label ? `: ${t.label}` : ''}`}</b>)}
          <small>{hasTrip ? 'Добавленное сейчас сразу попадёт к нему в поход.' : 'Добавьте, что нужно купить.'}</small>
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
      {hasTrip ? (
        selecting ? null : (
          <div className="list-tools">
            <span className="list-sum">{totals.count - totals.doneCount ? `Осталось ${totals.count - totals.doneCount} · ≈\u00A0${rub(totals.left)}` : 'Всё куплено'}</span>
            <span className="list-tools-r">
              <button type="button" className="more" disabled={!openList.length} onClick={() => { setPicked(new Set()); setSelecting(true); }}>Выбрать</button>
              <button type="button" className="more" onClick={copy}>Скопировать</button>
            </span>
          </div>
        )
      ) : <div className="btns fill" style={{ margin: '0 16px 14px' }}>
        {mine && hasHome ? (
          <button type="button" className="btn" onClick={() => endTrip(db, mine)}><Icon name="check" />Закончить поход</button>
        ) : (
          <button type="button" className="btn" disabled={!!mine} onClick={() => (hasHome ? setPicking(true) : goShopping(db, me, today))}><Icon name="bag" />{mine ? 'Вы в магазине' : 'Иду в магазин'}</button>
        )}
        <button type="button" className="btn soft" onClick={copy}><Icon name="copy" />Скопировать</button>
      </div>}
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
          {hasTrip ? null : (
            <div className="bento"><div className="tile wide" style={{ ['--h' as string]: 'var(--k-shop)', cursor: 'default' }}>
              <span className="t-k"><Icon name="cart" />Куплено на {rub(totals.bought)}</span>
              <span className="t-v">Осталось ≈&nbsp;{rub(totals.left)}{totals.unpriced ? ` · ${totals.unpriced} без цены` : ''}</span>
              <span className="bar" aria-hidden="true"><i style={{ width: `${totals.bought + totals.left ? (totals.bought / (totals.bought + totals.left)) * 100 : 0}%` }} /></span>
            </div></div>
          )}
          {urgent.length ? (
            <section className="card urgent-card" aria-label="Срочно">
              <div className="card-h"><h2>Срочно</h2>{hasTrip ? null : <span className="note" style={{ margin: 0 }}>{urgent.length}</span>}</div>
              {rows(urgent)}
            </section>
          ) : null}
          {groupByDept((hasTrip ? openList : list).filter((i) => !urgentIds.has(i.id)), marks).map((g) => {
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
                  <span className="dept-meta"><span>{hasTrip ? `${g.items.length} ${goods(g.items.length)}` : folded ? (done ? 'всё куплено' : `осталось ${g.items.length - got}`) : `${got} из ${g.items.length}`}</span>{money ? <span>{money}</span> : null}</span>
                </div>
                {folded ? null : <div id={`${id}-rows`}>{rows(g.items)}</div>}
              </section>
            );
          })}
          {hasTrip && doneList.length && !selecting ? (
            <section className="card done-card" aria-labelledby="done-h">
              <div className="card-h dept-h">
                <h2 id="done-h"><button type="button" className="dept-toggle" aria-expanded={showDone} aria-controls="done-rows" onClick={() => setShowDone(!showDone)}>
                  {doneList.some((i) => marks.get(i.id)?.at_home) ? 'Куплено и есть дома' : 'Куплено'}<Icon name="chev" />
                </button></h2>
                <span className="dept-meta"><span>{doneList.length} {goods(doneList.length)}</span>{totals.bought ? <span>{rub(totals.bought)}</span> : null}</span>
              </div>
              {showDone ? <div id="done-rows">{rows(groupByDept(doneList, marks).flatMap((g) => g.items))}</div> : null}
            </section>
          ) : null}
          {selecting ? (
            <div className="select-bar" role="region" aria-label="Выбранные строки">
              <div className="select-bar-top">
                <b>Выбрано {picked.size}</b>
                <button type="button" className="more" onClick={() => setPicked(picked.size === openList.length ? new Set() : new Set(openList.map((i) => i.id)))}>{picked.size === openList.length ? 'Снять все' : 'Выбрать все'}</button>
                <button type="button" className="btn soft sm" onClick={() => { setSelecting(false); setPicked(new Set()); }}>Готово</button>
              </div>
              <div className="select-bar-acts">
                <button type="button" className="btn sm" disabled={!picked.size} onClick={buyPicked}>Куплено</button>
                <button type="button" className="btn soft sm" disabled={!picked.size} onClick={tripPicked}>В поход</button>
                {hasHome ? <button type="button" className="btn soft sm" disabled={!picked.size} onClick={homePicked}>Есть дома</button> : null}
                <button type="button" className="btn soft sm danger-text" disabled={!picked.size} onClick={removePicked}>Убрать</button>
              </div>
            </div>
          ) : null}
        </>
      )}
      {sheet === 'add' && vocab && hasTrip ? (
        <ProductPicker db={db} me={me} vocab={vocab} catalog={catalog} inTrip={others.length > 0} shopper={others.length ? name(others[0].member_id) : null} onAdded={(text) => toast({ text })}
          onClose={() => { setSheet(null); if (params.get('add')) setParams({ view: 'list' }, { replace: true }); }} />
      ) : null}
      {sheet === 'add' && vocab && !hasTrip ? <AddItemSheet vocab={vocab} onClose={() => { setSheet(null); if (params.get('add')) setParams({}, { replace: true }); }} onAdd={async (a) => {
        const dept = await addManualItem(db, me, { ...a, vocab });
        const title = capitalize(a.title.trim());
        toast({ text: a.urgent ? `«${title}» — в «Срочно» наверху списка` : `«${title}» в списке, отдел «${dept}»` });
      }} /> : null}
      {picking && vocab ? (
        <TripSheet db={db} me={me} weeks={data.weeks} base={data.start} today={dayOfWeek(today)} lines={shown} marks={marks} vocab={vocab}
          cartLines={[...new Map(data.weeks.flatMap((w) => visibleItems(data.items, w.id, { weekStart: w.starts_on, marks, offers: data.offers })).map((i) => [i.id, i])).values()]}
          onStart={(c) => goShopping(db, me, today, c).then(() => setCartView(true))} onClose={() => setPicking(false)} />
      ) : null}
      {same ? <SameSheet lines={same.lines} marks={marks} origin={origin} onOpen={(l) => { setSame(null); setSheet(l); }} onClose={() => setSame(null)} /> : null}
      {sheet && sheet !== 'add' && hasTrip ? (
        <LineSheet line={sheet} mark={marks.get(sheet.id)} product={productOfLine(sheet, catalog)} who={sheet.source === 'menu' ? '' : added(sheet.added_by)}
          onSave={(c) => updateLine(db, sheet, c, productOfLine(sheet, catalog))}
          onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))}
          onTrip={(on) => setInTrip(db, [sheet], on)}
          onHome={hasHome ? (on) => setAtHome(db, sheet, me, on, marks.get(sheet.id)) : undefined}
          onUnbuy={() => setBought(db, sheet, me, false, marks.get(sheet.id))}
          onRemove={async () => {
            const gone = sheet;
            await removeItem(db, gone);
            toast({ text: `«${gone.title}» убрали из списка`, action: { label: 'Вернуть', run: () => { void restoreRemoved(db, gone); } } });
          }} onClose={() => setSheet(null)} />
      ) : null}
      {sheet && sheet !== 'add' && !hasTrip ? (
        <ItemSheet item={sheet} mark={marks.get(sheet.id)} onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))} onRemove={() => removeItem(db, sheet)}
          onHome={hasHome ? (on) => setAtHome(db, sheet, me, on, marks.get(sheet.id)) : undefined} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
