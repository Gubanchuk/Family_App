import { useMemo, useRef, useState } from 'react';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import Icon from '../shell/Icon';
import { DEPT_ORDER, rub } from './build';
import { frequent, searchCatalog, type Product } from './catalog';
import { guessDept } from './shopActions';
import { addProductLine, updateLine } from './tripActions';
import QtyStepper from './QtyStepper';
import { formatAmount, lineEstimate, OWN_UNITS, parseTyped, sellOf, stepOf, unitPriceLabel } from './units';
import type { Ingredient } from '../../data/db';
import { checkProduct } from '../assistant/api';

const FOOD_DEPTS = DEPT_ORDER;
const BY_KILO = ['Овощи и фрукты', 'Мясо и птица', 'Рыба'];
const BY_PACK = ['Молочное и яйца', 'Бакалея', 'Консервы и соусы', 'Заморозка', 'Специи', 'Хлеб', 'Сладости'];
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// «Добавить товар»: a product from the search goes in with one tap (one pack, one step of weight) and its
// amount can be changed right after; a new product is described once. The sheet stays open after each add,
// so a whole list goes in one go.
// check: asks the assistant whether a new product's price and unit look real (injectable for tests).
// shopper: who is in the shop right now, when the list's «Добавить» sends things straight into their trip.
export default function ProductPicker({ db, me, vocab, catalog, inTrip, shopper = null, onClose, onAdded, check = checkProduct }: {
  db: LocalDb; me: Member; vocab: Map<string, Ingredient>; catalog: Product[]; inTrip: boolean; shopper?: string | null;
  onClose: () => void; onAdded?: (text: string) => void; check?: typeof checkProduct;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Product | null>(null);
  const [own, setOwn] = useState(false);
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // The assistant's word on a product just described, shown under the search until the next add.
  const [hint, setHint] = useState('');
  // A new product: name, how it is counted, price per that unit, department.
  const [ownTitle, setOwnTitle] = useState('');
  const [ownUnit, setOwnUnit] = useState(0);
  const [ownPrice, setOwnPrice] = useState('');
  const [ownDept, setOwnDept] = useState('Другое');
  const search = useRef<HTMLInputElement>(null);
  // The product just added from the search: its amount can be changed with «Изменить количество».
  const [last, setLast] = useState<{ id: string; product: Product } | null>(null);
  const [editing, setEditing] = useState(false);
  // A new product's unit, price and department wait behind «Подробнее»: name and amount are enough to add.
  const [more, setMore] = useState(false);

  const found = useMemo(() => searchCatalog(catalog, query), [catalog, query]);
  const often = useMemo(() => frequent(catalog), [catalog]);
  const exact = found.some((p) => p.title.toLowerCase() === query.trim().toLowerCase());

  const back = () => { setPicked(null); setOwn(false); setEditing(false); setTimeout(() => search.current?.focus(), 0); };
  // One tap adds the product in its usual amount.
  const choose = async (p: Product) => {
    if (busy) return;
    setBusy(true); setNote(''); setHint('');
    try {
      const amount = stepOf(p.sell, p.unit, p.pieceWeight);
      const r = await addProductLine(db, me, { product: p, title: p.title, qty: amount, unit: p.unit, pricePerUnit: p.price, dept: p.dept, inTrip });
      const text = r.merged ? `Прибавили к «${p.title}» ${where}` : `«${p.title}» · ${formatAmount(amount, p.unit, p.sell, p.pieceWeight)} — ${where}`;
      setNote(text);
      setLast({ id: r.id, product: p });
      onAdded?.(text);
      setQuery('');
      setTimeout(() => search.current?.focus(), 0);
    } catch {
      setNote('Не получилось добавить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };
  const editLast = async () => {
    if (!last) return;
    const line = await db.shopping_items.get(last.id);
    setPicked(last.product); setOwn(false); setEditing(true);
    setQty(line?.qty ?? stepOf(last.product.sell, last.product.unit, last.product.pieceWeight));
  };
  const saveEdit = async () => {
    if (!last || busy) return;
    setBusy(true);
    try {
      const line = await db.shopping_items.get(last.id);
      if (line && qty > 0) await updateLine(db, line, { qty }, last.product);
      setNote(`«${last.product.title}» · ${formatAmount(qty, last.product.unit, last.product.sell, last.product.pieceWeight)} — ${where}`);
      setPicked(null); setEditing(false);
      setTimeout(() => search.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };
  // A new product starts counted the way its department is usually sold: vegetables and meat by the kilo,
  // groceries and dairy by the pack, everything else by the piece.
  const startOwn = () => {
    const title = capital(query.trim());
    const dept = guessDept(title, vocab);
    const k = BY_KILO.includes(dept) ? 0 : BY_PACK.includes(dept) ? 3 : 1;
    const u = OWN_UNITS[k];
    setOwn(true); setPicked(null); setOwnTitle(title); setOwnUnit(k); setOwnPrice(''); setMore(false); setLast(null);
    setOwnDept(dept); setQty(stepOf(sellOf(null, u.unit), u.unit));
  };

  const ou = OWN_UNITS[ownUnit];
  // The department the name points to leads the chips, so the guess is in view.
  const ownGuess = own ? guessDept(ownTitle || query, vocab) : 'Другое';
  const ownPerUnit = (() => { const n = parseTyped(ownPrice, 1); return n === null ? null : n / ou.factor; })();
  const price = picked ? picked.price : ownPerUnit;
  const est = lineEstimate(qty, price);
  const where = inTrip ? 'в походе' : 'в списке';

  const add = async () => {
    if (busy) return;
    const title = (picked ? picked.title : ownTitle).trim();
    if (!title || !(qty > 0)) return;
    setBusy(true);
    setNote('');
    try {
      const r = await addProductLine(db, me, picked
        ? { product: picked, title, qty, unit: picked.unit, pricePerUnit: picked.price, dept: picked.dept, inTrip }
        : { product: null, title, qty, unit: ou.unit, pricePerUnit: ownPerUnit, dept: ownDept, inTrip });
      const text = r.merged ? `Прибавили к «${title}» ${where}` : `«${title}» ${where}`;
      setNote(text);
      setHint('');
      // A new product with a price: the assistant looks at it in the background; a doubt shows here.
      if (!picked && ownPerUnit !== null && !r.merged) {
        const price = parseTyped(ownPrice, 1);
        void check({ title, unit: ou.label, price, dept: ownDept }).then((c) => {
          if (c && !c.ok && c.note) setHint(`Помощник сомневается: ${c.note} Цену можно поправить в строке.`);
        });
      }
      onAdded?.(text);
      setQuery(''); setPicked(null); setOwn(false); setLast(null);
      setTimeout(() => search.current?.focus(), 0);
    } catch {
      setNote('Не получилось добавить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const row = (p: Product) => (
    <button key={p.key} type="button" className="row-btn pick-row" aria-label={`Добавить: ${p.title}`} disabled={busy} onClick={() => void choose(p)}>
      <span className="row-main"><b>{p.title}</b><small>{[unitPriceLabel(p.price, p.unit, p.sell, p.pieceWeight), p.dept].filter(Boolean).join(' · ')}</small></span>
      <Icon name="plus" />
    </button>
  );

  const chosen = picked || own;
  return (
    <Sheet title="Добавить товар" sub={shopper ? `${shopper} сейчас в магазине — добавленное сразу попадёт к нему в поход.` : inTrip ? 'Попадёт в поход и в общий список.' : 'Попадёт в общий список. В поход — оттуда.'} onClose={onClose}
      keepOnBackdrop={!!(query.trim() || chosen)}
      actions={chosen ? (
        <div className="btns fill">
          <button type="button" className="btn soft" onClick={back}>Назад</button>
          {editing ? (
            <button type="button" className="btn" disabled={busy} onClick={saveEdit}>{est !== null ? `Сохранить · ${rub(est)}` : 'Сохранить'}</button>
          ) : (
            <button type="button" className="btn" disabled={busy || !(picked ? picked.title : ownTitle).trim()} onClick={add}>
              {est !== null ? `Добавить · ${rub(est)}` : 'Добавить'}
            </button>
          )}
        </div>
      ) : undefined}>
      <div className="picker">
        {note ? (
          <p className="note picker-note" role="status">{note}
            {last && !chosen ? <> · <button type="button" className="more" onClick={editLast}>Изменить количество</button></> : null}
          </p>
        ) : null}
        {hint ? <p className="note picker-hint" role="status">{hint}</p> : null}
        {!chosen ? (
          <>
            <label className="field picker-search"><span className="vh">Найти товар</span>
              <input ref={search} value={query} onChange={(e) => { setQuery(e.target.value); setNote(''); }} autoFocus maxLength={80} autoComplete="off"
                placeholder="Найти товар: молоко, курица, порошок" enterKeyHint="search"
                onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) { if (found[0]) void choose(found[0]); else startOwn(); } }} />
            </label>
            {query.trim() ? (
              <div className="picker-list">
                {found.map(row)}
                {!exact ? (
                  <button type="button" className="row-btn pick-row pick-new" onClick={startOwn}>
                    <span className="row-main"><b>Новый товар «{capital(query.trim())}»</b><small>Заведём один раз: единица, цена, отдел</small></span>
                    <Icon name="plus" />
                  </button>
                ) : null}
              </div>
            ) : often.length ? (
              <>
                <h3 className="picker-h">Часто берём</h3>
                <div className="picker-list">{often.map(row)}</div>
              </>
            ) : <p className="note" style={{ margin: '4px 0 0' }}>Начните вводить название. Если товара нет в списке, его можно завести.</p>}
          </>
        ) : picked ? (
          <div className="picker-pick">
            <div className="picker-title"><b>{picked.title}</b><small>{[unitPriceLabel(picked.price, picked.unit, picked.sell, picked.pieceWeight), picked.dept].filter(Boolean).join(' · ')}</small></div>
            <div className="picker-qty">
              <QtyStepper qty={qty} unit={picked.unit} sell={picked.sell} pieceWeight={picked.pieceWeight} title={picked.title} onChange={setQty} />
              <span className="amount">{est !== null ? `≈ ${rub(est)}` : 'без цены'}</span>
            </div>
          </div>
        ) : (
          <div className="picker-pick">
            <label className="field">Название<input value={ownTitle} onChange={(e) => setOwnTitle(e.target.value)} maxLength={80} /></label>
            <div className="picker-qty">
              <QtyStepper qty={qty} unit={ou.unit} sell={sellOf(null, ou.unit)} title={ownTitle || 'Новый товар'} onChange={setQty} />
              <span className="amount">{est !== null ? `≈ ${rub(est)}` : ''}</span>
            </div>
            <button type="button" className="more picker-more" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? 'Скрыть подробности' : `Подробнее: ${ou.label} · ${ownDept}${ownPrice.trim() ? ` · ${ownPrice} ₽` : ' · цена'}`}
            </button>
            {more ? (
              <>
                <div className="pick-g"><span>Считаем</span>
                  <div className="picks" role="radiogroup" aria-label="Как считаем">
                    {OWN_UNITS.map((u, k) => (
                      <button key={u.label} type="button" className="pick" role="radio" aria-checked={k === ownUnit} aria-pressed={k === ownUnit}
                        onClick={() => { setOwnUnit(k); setQty(stepOf(sellOf(null, u.unit), u.unit)); }}>{u.label}</button>
                    ))}
                  </div>
                </div>
                <label className="field">Цена за {ou.per}, ₽, если знаете
                  <input inputMode="decimal" value={ownPrice} onChange={(e) => setOwnPrice(e.target.value)} placeholder="Например, 120" maxLength={9} />
                </label>
                <div className="pick-g"><span>Отдел</span>
                  <div className="picks">
                    {[ownGuess, ...FOOD_DEPTS.filter((d) => d !== ownGuess)].map((d) => <button key={d} type="button" className="pick" aria-pressed={d === ownDept} onClick={() => setOwnDept(d)}>{d}</button>)}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </Sheet>
  );
}
