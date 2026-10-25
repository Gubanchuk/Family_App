import { useState } from 'react';
import type { DishOffer, Ingredient, LocalDb, ShopTrip, ShoppingItem, ShoppingMark, Week } from '../../data/db';
import type { Member } from '../family/useFamily';
import Icon from '../shell/Icon';
import { weekLabel } from '../menu/week';
import { rub } from './build';
import { productOfLine, type Product } from './catalog';
import { closed, groupByDept } from './useShop';
import { endTrip, goShopping, removeItem, setBought, setRealPrice } from './shopActions';
import { setAtHome } from './stock';
import { endSummary, goods, pullToTrip, reopenTrip, restoreLines, restoreRemoved, setInTrip, setLineQty, tripLines, tripTotals, updateLine } from './tripActions';
import type { ToastMessage } from '../shell/toastContext';
import ProductPicker from './ProductPicker';
import QtyStepper from './QtyStepper';
import LineSheet from './LineSheet';
import TripSheet from './TripSheet';
import { useFolds } from './useFolds';
import { joinSame, partsText, samePrice, type Same } from './sameProduct';
import SameSheet from './SameSheet';
import { formatAmount, formatShort, type LineUnit } from './units';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const UNITS: LineUnit[] = ['г', 'мл', 'шт', 'уп'];

export type TripData = { items: ShoppingItem[]; marks: Map<string, ShoppingMark>; trips: ShopTrip[]; weeks: Week[]; offers: Map<string, DishOffer>; start: string };

// «Поход»: the family's list for the next trip. Before the shop it is put together (amounts, prices, a total);
// in the shop the same screen is a checklist with what is in the cart and what is left.
export default function TripView({ db, me, members, data, vocab, catalog, listLines, mine, others, today, todayIdx, hasHome, onToast, onCopy }: {
  db: LocalDb; me: Member; members: Member[]; data: TripData; vocab: Map<string, Ingredient>; catalog: Product[];
  // Every line the list shows in either week: what can be taken into the trip.
  listLines: ShoppingItem[]; mine: ShopTrip | undefined; others: ShopTrip[]; today: Date; todayIdx: number; hasHome: boolean;
  onToast: (t: ToastMessage) => void; onCopy: (lines: ShoppingItem[]) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [showRest, setShowRest] = useState(false);
  const [sheet, setSheet] = useState<ShoppingItem | null>(null);
  const [same, setSame] = useState<Same | null>(null);
  const folds = useFolds();
  const { marks } = data;
  const shopping = !!mine;
  const lines = tripLines(data.items, marks, mine);
  const t = tripTotals(lines, marks);
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? '';
  const product = (l: ShoppingItem): Product | undefined => productOfLine(l, catalog);

  // What the list has that the trip does not: menu lines of each week, and the rest.
  const rest = listLines.filter((l) => !l.in_trip && !closed(marks.get(l.id)));
  const byWeek = data.weeks.map((w) => {
    const ls = rest.filter((l) => l.source === 'menu' && l.week_id === w.id);
    return { w, ls, sum: ls.reduce((s, l) => s + (l.est_price ?? 0), 0) };
  }).filter((x) => x.ls.length);
  const other = rest.filter((l) => l.source !== 'menu');

  // Taking lines in can be taken back: a mistap on «Всё по меню» must not flood a trip someone shops from.
  const takeAll = async (ls: ShoppingItem[], what: string) => {
    const before = ls.map((l) => ({ ...l }));
    await pullToTrip(db, ls, catalog);
    onToast({ text: `В поход: ${what}`, action: { label: 'Вернуть', run: () => { void restoreLines(db, before); } } });
  };
  // What was paid is known only for lines with the price typed in; otherwise the cart sum is an estimate too.
  const exact = lines.some((l) => marks.get(l.id)?.bought) && lines.every((l) => !marks.get(l.id)?.bought || marks.get(l.id)?.price_real !== null);
  const approx = exact ? '' : '≈\u00A0';
  const endShopping = async () => {
    const s = endSummary(lines, marks);
    const trip = mine!;
    await endTrip(db, trip);
    const left = s.left.length ? ` ${s.left.slice(0, 3).join(', ')}${s.left.length > 3 ? ' и ещё' : ''} — остались в походе.` : '';
    // Bought lines are spending by themselves; parents hear it, the child has no Деньги.
    const money = s.count && me.role === 'parent' ? ' Траты записаны в «Деньги».' : '';
    onToast({ text: s.count ? `Поход закончен: ${s.count} ${goods(s.count)} на ${approx}${rub(s.sum)}.${money}${left}` : 'Поход закончен.', action: { label: 'Вернуться', run: () => { void reopenTrip(db, trip); } } });
  };

  const row = (l: ShoppingItem) => {
    const m = marks.get(l.id);
    const done = !!m?.bought;
    const home = !!m?.at_home;
    const unit = UNITS.includes(l.unit as LineUnit) ? (l.unit as LineUnit) : null;
    const p = product(l);
    const price = m?.price_real ?? l.est_price;
    const who = l.source === 'menu' ? 'из меню' : l.source === 'home' ? 'закончилось дома' : name(l.added_by);
    const priceBtn = (
      <button type="button" className={`price-chip ${price === null ? 'empty' : ''}`} aria-label={`${l.title}: ${price !== null ? `цена ${rub(price)}, изменить` : 'указать цену'}`} onClick={() => setSheet(l)}>
        {price !== null ? rub(price) : '+ цена'}
      </button>
    );
    // The stepper shows «2 пачки»; the weight it means goes under the name.
    const full = unit && l.qty !== null ? formatAmount(l.qty, unit, p?.sell, p?.pieceWeight ?? null) : '';
    const short = unit && l.qty !== null ? formatShort(l.qty, unit, p?.sell, p?.pieceWeight ?? null) : '';
    const weight = full && full !== short ? full.split(' · ')[1] ?? '' : '';
    if (shopping) {
      // In the shop a tap puts the line in the cart; the amount and price open its sheet.
      return (
        <div className={`row trip-row ${done || home ? 'done' : ''}`} key={l.id}>
          <button type="button" className="row-btn" aria-pressed={done} aria-label={`${l.title}${l.qty_text ? `, ${l.qty_text}` : ''}${done ? ', в корзине' : ''}`}
            onClick={() => (home ? setAtHome(db, l, me, false, m) : setBought(db, l, me, !done, m, hasHome ? { vocab } : undefined))}>
            <span className="check" aria-hidden="true"><Icon name="check" /></span>
            <span className="row-main"><b>{l.title}</b><small>{home ? 'есть дома' : [l.qty_text, who].filter(Boolean).join(' · ')}</small></span>
            {l.urgent && !done ? <span className="pill">срочно</span> : null}
          </button>
          {priceBtn}
        </div>
      );
    }
    return (
      <div className="row trip-row plan" key={l.id}>
        <div className="trip-row-top">
          <button type="button" className="row-btn" onClick={() => setSheet(l)} aria-label={`${l.title}: изменить`}>
            <span className="row-main"><b>{l.title}</b><small>{[unit && l.qty !== null ? weight : l.qty_text, who].filter(Boolean).join(' · ')}</small></span>
            {l.urgent ? <span className="pill">срочно</span> : null}
          </button>
          {priceBtn}
        </div>
        {unit && l.qty !== null ? (
          <div className="trip-row-qty">
            <QtyStepper qty={l.qty} unit={unit} sell={p?.sell ?? { sell: 'piece', step: 1 }} pieceWeight={p?.pieceWeight ?? null} title={l.title}
              onChange={(q) => setLineQty(db, l, q, p?.price ?? undefined, p?.sell, p?.pieceWeight ?? null)} />
          </div>
        ) : null}
      </div>
    );
  };

  // Taking lines from the list: on top while the trip is empty, under its lines once it has some.
  const pullCard = !shopping && (byWeek.length || other.length) ? (
    <section className="card trip-pull" aria-label="Взять из списка">
      <div className="card-h"><h2>Взять из списка</h2></div>
      <div className="trip-pull-btns">
        {byWeek.map(({ w, ls, sum }) => (
          <button key={w.id} type="button" className="pull-btn" onClick={() => takeAll(ls, `всё по меню на ${weekLabel(w.starts_on)}`)}>
            <span><b>Всё по меню на {weekLabel(w.starts_on)}</b><small>{ls.length} {goods(ls.length)}{sum ? ` · ≈ ${rub(sum)}` : ''}</small></span><Icon name="plus" />
          </button>
        ))}
        {data.weeks.length ? (
          <button type="button" className="pull-btn" onClick={() => setPulling(true)}>
            <span><b>На завтрак, обед или ужин</b><small>продукты одного приёма пищи или блюда</small></span><Icon name="chev" />
          </button>
        ) : null}
      </div>
      {other.length ? (
        <>
          <button type="button" className="more" aria-expanded={showRest} onClick={() => setShowRest(!showRest)}>{showRest ? 'Скрыть' : `Добавлено вручную и с доски · ${other.length}`}</button>
          {showRest ? other.map((l) => (
            <div className="row" key={l.id}>
              <span className="row-main"><b>{l.title}</b><small>{[l.qty_text, name(l.added_by)].filter(Boolean).join(' · ')}</small></span>
              <button type="button" className="round-btn sm-btn" aria-label={`В поход: ${l.title}`} onClick={() => takeAll([l], l.title)}><Icon name="plus" /></button>
            </div>
          )) : null}
        </>
      ) : null}
    </section>
  ) : null;
  // In the shop a ticked line stays where it was, so the next one does not slide under the thumb; a department
  // that is all bought folds by itself.
  // Where a line came from, for a product listed more than once.
  const fromWhom = (l: ShoppingItem) => (l.source === 'menu' ? 'из меню' : l.source === 'home' ? 'закончилось дома' : name(l.added_by));
  // One row for a product listed more than once: its parts under the name, one tick for all of them.
  const sameRow = (s: Same) => {
    const first = s.lines[0];
    const all = s.lines.every((l) => marks.get(l.id)?.bought);
    const price = samePrice(s, marks);
    const parts = partsText(s, fromWhom);
    const urgent = s.lines.some((l) => l.urgent);
    const chip = (
      <button type="button" className={`price-chip ${price === null ? 'empty' : ''}`} aria-label={`${first.title}: части и цены`} onClick={() => setSame(s)}>
        {price !== null ? rub(price) : '+ цена'}
      </button>
    );
    if (shopping) {
      return (
        <div className={`row trip-row ${all ? 'done' : ''}`} key={s.key}>
          <button type="button" className="row-btn" aria-pressed={all} aria-label={`${first.title}, ${parts}${all ? ', в корзине' : ''}`}
            onClick={async () => { for (const l of s.lines) await setBought(db, l, me, !all, marks.get(l.id), hasHome ? { vocab } : undefined); }}>
            <span className="check" aria-hidden="true"><Icon name="check" /></span>
            <span className="row-main"><b>{first.title}</b><small>{parts}</small></span>
            {urgent && !all ? <span className="pill">срочно</span> : null}
          </button>
          {chip}
        </div>
      );
    }
    return (
      <div className="row trip-row plan" key={s.key}>
        <div className="trip-row-top">
          <button type="button" className="row-btn" onClick={() => setSame(s)} aria-label={`${first.title}: ${parts}, открыть части`}>
            <span className="row-main"><b>{first.title}</b><small>{parts}</small></span>
            {urgent ? <span className="pill">срочно</span> : null}
          </button>
          {chip}
        </div>
      </div>
    );
  };
  const rows = (items: ShoppingItem[]) => joinSame(items, marks).map((s) => (s.lines.length === 1 ? row(s.lines[0]) : sameRow(s)));

  const groups = groupByDept(lines, marks).map((g) => (shopping
    ? { ...g, items: [...g.items].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.title.localeCompare(b.title, 'ru')) }
    : g));
  return (
    <>
      {others.length ? (
        <section className="notice" aria-live="polite"><span className="row-main">
          {others.map((o) => <b key={o.id}>{`${name(o.member_id) || 'Кто-то'} в магазине с ${hhmm(o.started_at)}`}</b>)}
          <small>Добавленное в поход сразу попадёт к нему в корзину.</small>
        </span></section>
      ) : null}

      {shopping ? (
        // One short line on top that stays in view: the checklist starts right under it.
        <section className="trip-strip" aria-label="Итог похода">
          <div className="trip-strip-row">
            <span className="trip-strip-t">
              <b>В корзине {t.inCart.count} из {t.count} · {approx}{rub(t.inCart.sum)}</b>
              <small>Осталось ≈&nbsp;{rub(t.left.sum)}{t.unpriced ? ` · ${t.unpriced} без цены` : ''}</small>
            </span>
            <button type="button" className="btn sm" onClick={endShopping}><Icon name="check" />Закончить</button>
          </div>
          <div className="trip-strip-row">
            <span className="bar" aria-hidden="true"><i style={{ width: `${t.count ? (t.inCart.count / t.count) * 100 : 0}%` }} /></span>
            <button type="button" className="trip-strip-add" onClick={() => setPicker(true)}><Icon name="plus" />Добавить</button>
          </div>
        </section>
      ) : (
      <section className="trip-sum" aria-label="Итог похода">
        {(
          <>
            <span className="trip-k">В походе {t.count} {goods(t.count)}</span>
            <b className="trip-total">≈&nbsp;{rub(t.total)}</b>
            <small>{t.unpriced ? `${t.unpriced} без цены — цену можно указать в строке` : 'Примерно, по ценам Магнита'}</small>
            <button type="button" className="btn trip-go" disabled={!lines.length} onClick={() => goShopping(db, me, today)}><Icon name="bag" />Иду в магазин</button>
            {lines.length ? <button type="button" className="more trip-copy" onClick={() => onCopy(lines)}>Скопировать список текстом</button> : null}
          </>
        )}
      </section>
      )}

      {shopping ? null : (
        <div className="trip-add">
          <button type="button" className="trip-search" onClick={() => setPicker(true)}><Icon name="plus" /><span>Найти и добавить товар</span></button>
        </div>
      )}

      {!lines.length ? pullCard : null}

      {lines.length === 0 ? (
        <section className="card"><p className="note" style={{ margin: 0 }}>
          {shopping ? 'В походе пусто. Добавьте, за чем пришли.' : 'Поход пока пуст. Найдите товары или возьмите их из списка — каждый в семье может добавить своё.'}
        </p></section>
      ) : groups.map((g) => {
        const id = `trip-${g.dept.replace(/\s+/g, '-')}`;
        const got = g.items.filter((i) => closed(marks.get(i.id))).length;
        const done = shopping && got === g.items.length;
        const folded = folds.isFolded(`trip:${g.dept}`, done);
        const sum = tripTotals(g.items, marks);
        const money = shopping ? (done ? rub(sum.inCart.sum) : sum.left.sum ? `осталось ≈ ${rub(sum.left.sum)}` : '') : sum.total ? `≈ ${rub(sum.total)}` : '';
        return (
          <section className="card" key={g.dept} aria-labelledby={id}>
            <div className="card-h dept-h">
              <h2 id={id}><button type="button" className="dept-toggle" aria-expanded={!folded} aria-controls={`${id}-rows`} onClick={() => folds.toggle(`trip:${g.dept}`, done)}>{g.dept}<Icon name="chev" /></button></h2>
              <span className="dept-meta"><span>{shopping ? `${got} из ${g.items.length}` : `${g.items.length} ${goods(g.items.length)}`}</span>{money ? <span>{money}</span> : null}</span>
            </div>
            {folded ? null : <div id={`${id}-rows`}>{rows(g.items)}</div>}
          </section>
        );
      })}

      {lines.length ? pullCard : null}

      {picker ? <ProductPicker db={db} me={me} vocab={vocab} catalog={catalog} inTrip onClose={() => setPicker(false)} /> : null}
      {pulling ? (
        <TripSheet mode="pull" db={db} me={me} weeks={data.weeks} base={data.start} today={todayIdx} lines={rest} cartLines={listLines} marks={marks} vocab={vocab}
          onStart={async (c) => { if (c) { const ids = new Set(c.items.map((x) => x.id)); await takeAll(listLines.filter((l) => ids.has(l.id)), c.label || 'выбранное'); } }}
          onClose={() => setPulling(false)} />
      ) : null}
      {same ? <SameSheet lines={same.lines} marks={marks} origin={fromWhom} onOpen={(l) => { setSame(null); setSheet(l); }} onClose={() => setSame(null)} /> : null}
      {sheet ? (
        <LineSheet line={sheet} mark={marks.get(sheet.id)} product={product(sheet)} who={sheet.source === 'menu' ? '' : name(sheet.added_by) ? `добавил(а) ${name(sheet.added_by)}` : ''}
          onSave={(c) => updateLine(db, sheet, c, product(sheet))}
          onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))}
          onTrip={(on) => setInTrip(db, [sheet], on)}
          onHome={hasHome ? (on) => setAtHome(db, sheet, me, on, marks.get(sheet.id)) : undefined}
          onUnbuy={() => setBought(db, sheet, me, false, marks.get(sheet.id))}
          onRemove={async () => {
            const gone = sheet;
            await removeItem(db, gone);
            onToast({ text: `«${gone.title}» убрали из списка`, action: { label: 'Вернуть', run: () => { void restoreRemoved(db, gone); } } });
          }} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
