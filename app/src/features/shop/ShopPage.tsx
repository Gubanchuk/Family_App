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
import { groupByDept, useShop, visibleItems } from './useShop';
import { addManualItem, goShopping, removeItem, setBought, setRealPrice } from './shopActions';
import { listText } from './listText';
import AddItemSheet from './AddItemSheet';
import ItemSheet from './ItemSheet';
import { useToast } from '../shell/toastContext';
import { capitalize } from './menuList';
import ListDays from './ListDays';
import { useFeature } from '../../data/useFeature';
import { setListDays } from '../menu/weekActions';
import { dayOfWeek } from '../menu/week';

const TRIP_MS = 3 * 3600 * 1000;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
type Clip = { writeText: (t: string) => Promise<void> };

export default function ShopPage({ me, members, db = localDb, today: fixedToday, clipboard }: { me: Member; members: Member[]; db?: LocalDb; today?: Date; clipboard?: Clip }) {
  const today = useToday(fixedToday);
  const data = useShop(db, me.household_id, today);
  const sync = useSync();
  const vocab = useLiveQuery(async () => new Map((await db.ingredients.toArray()).map((v) => [v.item, v])), [db]);
  const [weekPick, setWeekPick] = useState<string | null>(null);
  // Home's «Добавить» → «В покупки» opens the list with the add form (?add=1).
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<'add' | ShoppingItem | null>(params.get('add') === '1' ? 'add' : null);
  const [note, setNote] = useState('');
  const toast = useToast();
  const folds = useFolds();
  const hasDays = useFeature(db, 'listDays');
  const weekId = weekPick ?? data?.weeks[0]?.id ?? null;
  const shown = useMemo(() => {
    if (!data) return [];
    const weekStart = data.weeks.find((w) => w.id === weekId)?.starts_on ?? data.start;
    return visibleItems(data.items, weekId, { weekStart, marks: data.marks, offers: data.offers });
  }, [data, weekId]);
  if (!data) return <><Header title="Покупки" /><p className="note" style={{ margin: 16 }}>Загружаем список…</p></>;

  const { marks, lastTrip } = data;
  const totals = listTotals(shown.map((i) => ({ est: i.est_price, real: marks.get(i.id)?.price_real ?? null, bought: !!marks.get(i.id)?.bought })));
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const tripFresh = lastTrip && today.getTime() - new Date(lastTrip.started_at).getTime() < TRIP_MS;
  const meShopping = tripFresh && lastTrip!.member_id === me.id;
  const week = data.weeks.find((w) => w.id === weekId);
  const origin = (i: ShoppingItem) => (i.source === 'menu' ? 'из меню' : i.source === 'offer' ? 'к предложенному блюду' : `вручную · ${name(i.added_by)}`);

  // Urgent lines still to buy get their own card on top; once bought they go back to their department.
  const urgent = shown.filter((i) => i.urgent && !marks.get(i.id)?.bought);
  const urgentIds = new Set(urgent.map((i) => i.id));
  const row = (i: ShoppingItem) => {
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
        <button type="button" className="amount amount-btn" aria-label={`${i.title}: ${price !== null ? `цена ${rub(price)}` : 'цена не указана'}`} onClick={() => setSheet(i)}>{price !== null ? rub(price) : '—'}</button>
      </div>
    );
  };

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
      {week && hasDays && me.role === 'parent' ? (
        <ListDays key={`${week.id}-${(week.list_days ?? []).join()}`} week={week} today={week.starts_on === data.start ? dayOfWeek(today) : null}
          onSave={(days) => setListDays(db, week, days)} />
      ) : null}
      {sync.message ? (
        <section className="notice" role="alert"><span className="row-main"><b>{sync.message}</b></span>
          <button type="button" className="btn soft sm" onClick={sync.dismiss}>Понятно</button></section>
      ) : null}
      <div className="btns fill" style={{ margin: '0 16px 14px' }}>
        <button type="button" className="btn" disabled={!!meShopping} onClick={() => goShopping(db, me, today)}><Icon name="bag" />{meShopping ? 'Вы в магазине' : 'Иду в магазин'}</button>
        <button type="button" className="btn soft" onClick={copy}><Icon name="copy" />Скопировать</button>
      </div>
      {note ? <p className="note" role="status" style={{ margin: '0 16px 12px' }}>{note}</p> : null}
      {shown.length === 0 ? (
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
          {groupByDept(shown.filter((i) => !urgentIds.has(i.id)), marks).map((g) => {
            const id = `dept-${g.dept.replace(/\s+/g, '-')}`;
            const got = g.items.filter((i) => marks.get(i.id)?.bought).length;
            const done = got === g.items.length;
            const folded = folds.isFolded(g.dept, done);
            // What the department costs: what is left to buy, or what it took once all is bought.
            const sum = listTotals(g.items.map((i) => ({ est: i.est_price, real: marks.get(i.id)?.price_real ?? null, bought: !!marks.get(i.id)?.bought })));
            const money = done ? (sum.bought ? ` · ${rub(sum.bought)}` : '') : sum.left ? ` · ≈ ${rub(sum.left)}` : '';
            return (
              <section className="card" key={g.dept} aria-labelledby={id}>
                <div className="card-h dept-h">
                  <h2 id={id}><button type="button" className="dept-toggle" aria-expanded={!folded} aria-controls={`${id}-rows`} onClick={() => folds.toggle(g.dept, done)}>{g.dept}<Icon name="chev" /></button></h2>
                  <span className="note" style={{ margin: 0 }}>{folded ? (done ? 'всё куплено' : `осталось ${g.items.length - got}`) : `${got} из ${g.items.length}`}{money}</span>
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
      {sheet && sheet !== 'add' ? (
        <ItemSheet item={sheet} mark={marks.get(sheet.id)} onPrice={(p) => setRealPrice(db, sheet, me, p, marks.get(sheet.id))} onRemove={() => removeItem(db, sheet)} onClose={() => setSheet(null)} />
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
