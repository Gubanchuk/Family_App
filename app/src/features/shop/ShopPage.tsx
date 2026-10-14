import { useMemo, useState } from 'react';
import { useToday } from '../../lib/useToday';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import { localDb, type LocalDb, type ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import { weekLabel } from '../menu/week';
import { listTotals, rub } from './build';
import { groupByDept, useShop, visibleItems } from './useShop';
import { addManualItem, goShopping, removeItem, setBought, setRealPrice } from './shopActions';
import { listText } from './listText';
import AddItemSheet from './AddItemSheet';
import ItemSheet from './ItemSheet';

const TRIP_MS = 3 * 3600 * 1000;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const products = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'продукта' : 'продуктов');
type Clip = { writeText: (t: string) => Promise<void> };

export default function ShopPage({ me, members, db = localDb, today: fixedToday, clipboard }: { me: Member; members: Member[]; db?: LocalDb; today?: Date; clipboard?: Clip }) {
  const today = useToday(fixedToday);
  const data = useShop(db, me.household_id, today);
  const vocab = useLiveQuery(async () => new Map((await db.ingredients.toArray()).map((v) => [v.item, v])), [db]);
  const [weekPick, setWeekPick] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'add' | ShoppingItem | null>(null);
  const [note, setNote] = useState('');
  const weekId = weekPick ?? data?.weeks[0]?.id ?? null;
  const shown = useMemo(() => (data ? visibleItems(data.items, weekId) : []), [data, weekId]);
  if (!data) return <><Header title="Покупки" /><p className="note" style={{ margin: 16 }}>Загружаем список…</p></>;

  const { marks, lastTrip } = data;
  const totals = listTotals(shown.map((i) => ({ est: i.est_price, real: marks.get(i.id)?.price_real ?? null, bought: !!marks.get(i.id)?.bought })));
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const tripFresh = lastTrip && today.getTime() - new Date(lastTrip.started_at).getTime() < TRIP_MS;
  const meShopping = tripFresh && lastTrip!.member_id === me.id;
  const week = data.weeks.find((w) => w.id === weekId);
  const origin = (i: ShoppingItem) => (i.source === 'menu' ? 'из меню' : i.source === 'offer' ? 'к предложенному блюду' : `вручную · ${name(i.added_by)}`);

  const copy = async () => {
    const text = listText(week ? `Покупки на ${weekLabel(week.starts_on)}` : 'Покупки', shown.filter((i) => !marks.get(i.id)?.bought));
    const clip = clipboard ?? navigator.clipboard;
    try { await clip.writeText(text); setNote('Список скопирован'); } catch { setNote('Не получилось скопировать. Выделите список вручную.'); }
  };

  return (
    <>
      <Header title="Покупки" subtitle={`Отмечено ${totals.doneCount} из ${totals.count}`}
        action={<button type="button" className="head-pill" onClick={() => setSheet('add')}><Icon name="plus" />Добавить</button>} />
      {tripFresh && !meShopping ? (
        <section className="notice" aria-live="polite"><span className="row-main"><b>{name(lastTrip!.member_id)} в магазине с {hhmm(lastTrip!.started_at)}</b><small>Добавьте, что нужно купить.</small></span></section>
      ) : null}
      {data.weeks.length > 1 ? (
        <div className="segs" role="tablist" aria-label="Неделя">
          {data.weeks.map((w) => <button key={w.id} type="button" role="tab" aria-selected={w.id === weekId} onClick={() => setWeekPick(w.id)}>{weekLabel(w.starts_on)}</button>)}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <section className="card"><p className="note" style={{ margin: 0 }}>Список соберётся сам, когда родитель утвердит неделю в Меню. Срочное можно добавить вручную.</p></section>
      ) : (
        <>
          <div className="bento"><div className="tile wide" style={{ ['--h' as string]: 'var(--k-shop)', cursor: 'default' }}>
            <span className="t-k"><Icon name="cart" />Куплено на {rub(totals.bought)}</span>
            <span className="t-v">Осталось ≈&nbsp;{rub(totals.left)}{totals.unpriced ? ` без ${totals.unpriced} ${products(totals.unpriced)}` : ''}</span>
            <span className="bar" aria-hidden="true"><i style={{ width: `${totals.bought + totals.left ? (totals.bought / (totals.bought + totals.left)) * 100 : 0}%` }} /></span>
          </div></div>
          <div className="btns fill" style={{ margin: '0 16px 14px' }}>
            <button type="button" className="btn" disabled={!!meShopping} onClick={() => goShopping(db, me, today)}><Icon name="bag" />{meShopping ? 'Вы в магазине' : 'Иду в магазин'}</button>
            <button type="button" className="btn soft" onClick={copy}><Icon name="copy" />Скопировать</button>
          </div>
          {note ? <p className="note" role="status" style={{ margin: '0 16px 12px' }}>{note}</p> : null}
          {groupByDept(shown, marks).map((g) => (
            <section className="card" key={g.dept} aria-labelledby={`dept-${g.dept}`}>
              <div className="card-h"><h2 id={`dept-${g.dept}`}>{g.dept}</h2><span className="note" style={{ margin: 0 }}>{g.items.filter((i) => marks.get(i.id)?.bought).length} из {g.items.length}</span></div>
              {g.items.map((i) => {
                const m = marks.get(i.id);
                const done = !!m?.bought;
                const price = m?.price_real ?? i.est_price;
                return (
                  <div className={`row ${done ? 'done' : ''}`} key={i.id}>
                    <button type="button" className="row-btn" aria-pressed={done} aria-label={`${i.title}${i.qty_text ? `, ${i.qty_text}` : ''}${i.urgent ? ', срочно' : ''}`} onClick={() => setBought(db, i, me, !done, m)}>
                      <span className="check" aria-hidden="true"><Icon name="check" /></span>
                      <span className="row-main"><b>{i.title}</b><small>{[i.qty_text, origin(i)].filter(Boolean).join(' · ')}</small></span>
                      {i.urgent ? <span className="pill">срочно</span> : null}
                    </button>
                    <button type="button" className="amount amount-btn" aria-label={`${i.title}: цена`} onClick={() => setSheet(i)}>{price !== null ? rub(price) : '—'}</button>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
      {sheet === 'add' && vocab ? <AddItemSheet vocab={vocab} onAdd={(a) => addManualItem(db, me, { ...a, vocab })} onClose={() => setSheet(null)} /> : null}
      {sheet && sheet !== 'add' ? (
        <ItemSheet item={sheet} mark={marks.get(sheet.id)} onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))} onRemove={() => removeItem(db, sheet)} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
