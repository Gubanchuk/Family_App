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
import { endSummary, goods, pullToTrip, setInTrip, setLineQty, tripLines, tripTotals, updateLine } from './tripActions';
import ProductPicker from './ProductPicker';
import QtyStepper from './QtyStepper';
import LineSheet from './LineSheet';
import TripSheet from './TripSheet';
import { useFolds } from './useFolds';
import type { LineUnit } from './units';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const UNITS: LineUnit[] = ['г', 'мл', 'шт', 'уп'];

export type TripData = { items: ShoppingItem[]; marks: Map<string, ShoppingMark>; trips: ShopTrip[]; weeks: Week[]; offers: Map<string, DishOffer>; start: string };

// «Поход»: the family's list for the next trip. Before the shop it is put together (amounts, prices, a total);
// in the shop the same screen is a checklist with what is in the cart and what is left.
export default function TripView({ db, me, members, data, vocab, catalog, listLines, mine, others, today, todayIdx, hasHome, onToast, onCopy }: {
  db: LocalDb; me: Member; members: Member[]; data: TripData; vocab: Map<string, Ingredient>; catalog: Product[];
  // Every line the list shows in either week: what can be taken into the trip.
  listLines: ShoppingItem[]; mine: ShopTrip | undefined; others: ShopTrip[]; today: Date; todayIdx: number; hasHome: boolean;
  onToast: (text: string) => void; onCopy: (lines: ShoppingItem[]) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [showRest, setShowRest] = useState(false);
  const [sheet, setSheet] = useState<ShoppingItem | null>(null);
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

  const takeAll = async (ls: ShoppingItem[], what: string) => { await pullToTrip(db, ls, catalog); onToast(`В поход: ${what}`); };

  const row = (l: ShoppingItem) => {
    const m = marks.get(l.id);
    const done = !!m?.bought;
    const home = !!m?.at_home;
    const unit = UNITS.includes(l.unit as LineUnit) ? (l.unit as LineUnit) : null;
    const p = product(l);
    const price = m?.price_real ?? l.est_price;
    const who = l.source === 'menu' ? 'из меню' : l.source === 'home' ? 'закончилось дома' : name(l.added_by);
    const priceBtn = (
      <button type="button" className="amount amount-btn" aria-label={`${l.title}: ${price !== null ? `цена ${rub(price)}` : 'цена не указана'}`} onClick={() => setSheet(l)}>
        {price !== null ? rub(price) : '—'}
      </button>
    );
    if (shopping) {
      // In the shop a tap puts the line in the cart; the amount and price open its sheet.
      return (
        <div className={`row trip-row ${done || home ? 'done' : ''}`} key={l.id}>
          <button type="button" className="row-btn" aria-pressed={done} aria-label={`${l.title}${l.qty_text ? `, ${l.qty_text}` : ''}${done ? ', в корзине' : ''}`}
            onClick={() => (home ? setAtHome(db, l, me, false, m) : setBought(db, l, me, !done, m, hasHome ? { vocab } : undefined))}>
            <span className="check" aria-hidden="true"><Icon name="check" /></span>
            <span className="row-main"><b>{l.title}</b><small>{home ? 'есть дома' : [l.qty_text, l.urgent ? 'срочно' : '', who].filter(Boolean).join(' · ')}</small></span>
          </button>
          {priceBtn}
        </div>
      );
    }
    return (
      <div className="row trip-row plan" key={l.id}>
        <button type="button" className="row-btn" onClick={() => setSheet(l)} aria-label={`${l.title}: изменить`}>
          <span className="row-main"><b>{l.title}</b><small>{[unit && l.qty !== null ? '' : l.qty_text, l.urgent ? 'срочно' : '', who].filter(Boolean).join(' · ')}</small></span>
        </button>
        <span className="trip-row-end">
          {unit && l.qty !== null ? (
            <QtyStepper qty={l.qty} unit={unit} sell={p?.sell ?? { sell: 'piece', step: 1 }} pieceWeight={p?.pieceWeight ?? null} title={l.title}
              onChange={(q) => setLineQty(db, l, q, p?.price ?? undefined, p?.sell, p?.pieceWeight ?? null)} />
          ) : null}
          {priceBtn}
        </span>
      </div>
    );
  };

  const groups = groupByDept(lines, marks);
  return (
    <>
      {others.length ? (
        <section className="notice" aria-live="polite"><span className="row-main">
          {others.map((o) => <b key={o.id}>{`${name(o.member_id) || 'Кто-то'} в магазине с ${hhmm(o.started_at)}`}</b>)}
          <small>Добавленное в поход сразу попадёт к нему в корзину.</small>
        </span></section>
      ) : null}

      {shopping ? (
        <div className="trip-shop-head">
          <span><b>В магазине</b> с {hhmm(mine!.started_at)}</span>
          <button type="button" className="btn sm" onClick={async () => {
            const s = endSummary(lines, marks);
            await endTrip(db, mine!);
            onToast(s.count ? `Поход закончен: ${s.count} ${goods(s.count)} на ${rub(s.sum)}.${s.left.length ? ` ${s.left.slice(0, 3).join(', ')}${s.left.length > 3 ? ' и ещё' : ''} — остались в походе.` : ''}` : 'Поход закончен.');
          }}><Icon name="check" />Закончить поход</button>
        </div>
      ) : null}

      <section className={`trip-sum ${shopping ? 'shop' : ''}`} aria-label="Итог похода">
        {shopping ? (
          <>
            <div className="trip-sum-cols">
              <div><span className="trip-k">В корзине</span><b>{t.inCart.count} · {rub(t.inCart.sum)}</b></div>
              <div><span className="trip-k">Осталось</span><b>{t.left.count} · ≈&nbsp;{rub(t.left.sum)}</b></div>
            </div>
            <span className="bar" aria-hidden="true"><i style={{ width: `${t.count ? (t.inCart.count / t.count) * 100 : 0}%` }} /></span>
            <small>Всего ≈ {rub(t.total)} за {t.count} {goods(t.count)}{t.unpriced ? ` · ${t.unpriced} без цены` : ''}</small>
          </>
        ) : (
          <>
            <span className="trip-k">В походе {t.count} {goods(t.count)}</span>
            <b className="trip-total">≈&nbsp;{rub(t.total)}</b>
            {t.unpriced ? <small>{t.unpriced} без цены — цену можно указать в строке</small> : <small>Прикидка по ценам Магнита</small>}
          </>
        )}
      </section>

      <div className="trip-add">
        <button type="button" className="trip-search" onClick={() => setPicker(true)}><Icon name="plus" /><span>Найти и добавить товар</span></button>
      </div>

      {!shopping && (byWeek.length || other.length) ? (
        <section className="card trip-pull" aria-label="Взять из списка">
          <div className="card-h"><h2>Взять из списка</h2><span className="note" style={{ margin: 0 }}>{rest.length}</span></div>
          <div className="trip-pull-btns">
            {byWeek.map(({ w, ls, sum }) => (
              <button key={w.id} type="button" className="btn soft sm" onClick={() => takeAll(ls, `всё по меню на ${weekLabel(w.starts_on)}`)}>
                Всё по меню · {weekLabel(w.starts_on)} · {ls.length}{sum ? ` · ≈ ${rub(sum)}` : ''}
              </button>
            ))}
            {data.weeks.length ? <button type="button" className="btn soft sm" onClick={() => setPulling(true)}>По приёму пищи или блюду</button> : null}
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
      ) : null}

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
        const money = shopping ? (done ? rub(sum.inCart.sum) : sum.left.sum ? `≈ ${rub(sum.left.sum)}` : '') : sum.total ? `≈ ${rub(sum.total)}` : '';
        return (
          <section className="card" key={g.dept} aria-labelledby={id}>
            <div className="card-h dept-h">
              <h2 id={id}><button type="button" className="dept-toggle" aria-expanded={!folded} aria-controls={`${id}-rows`} onClick={() => folds.toggle(`trip:${g.dept}`, done)}>{g.dept}<Icon name="chev" /></button></h2>
              <span className="dept-meta"><span>{shopping ? `${got} из ${g.items.length}` : `${g.items.length} ${goods(g.items.length)}`}</span>{money ? <span>{money}</span> : null}</span>
            </div>
            {folded ? null : <div id={`${id}-rows`}>{g.items.map(row)}</div>}
          </section>
        );
      })}

      {!shopping ? (
        <div className="trip-go">
          <button type="button" className="btn" disabled={!lines.length} onClick={() => goShopping(db, me, today)}><Icon name="bag" />Иду в магазин</button>
          <button type="button" className="btn soft" disabled={!lines.length} onClick={() => onCopy(lines)}><Icon name="copy" />Скопировать</button>
        </div>
      ) : null}

      {picker ? <ProductPicker db={db} me={me} vocab={vocab} catalog={catalog} inTrip onClose={() => setPicker(false)} /> : null}
      {pulling ? (
        <TripSheet mode="pull" db={db} me={me} weeks={data.weeks} base={data.start} today={todayIdx} lines={rest} cartLines={listLines} marks={marks} vocab={vocab}
          onStart={async (c) => { if (c) { const ids = new Set(c.items.map((x) => x.id)); await takeAll(listLines.filter((l) => ids.has(l.id)), c.label || 'выбранное'); } }}
          onClose={() => setPulling(false)} />
      ) : null}
      {sheet ? (
        <LineSheet line={sheet} mark={marks.get(sheet.id)} product={product(sheet)} who={sheet.source === 'menu' ? '' : name(sheet.added_by) ? `добавил(а) ${name(sheet.added_by)}` : ''}
          onSave={(c) => updateLine(db, sheet, c, product(sheet))}
          onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))}
          onTrip={(on) => setInTrip(db, [sheet], on)}
          onHome={hasHome ? (on) => setAtHome(db, sheet, me, on, marks.get(sheet.id)) : undefined}
          onRemove={() => removeItem(db, sheet)} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
