import { useState } from 'react';
import type { HomeStock, Ingredient, LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { deptRank } from './build';
import { capitalize } from './menuList';
import { guessDept } from './shopActions';
import { removeStock, runOut, setStock } from './stock';

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

// «Дома»: what the family has at home, by department, «закончилось» first. Bought food lands here by itself;
// «Закончилось» puts a product back on the list for everyone.
export default function HomePanel({ db, me, stock, vocab, items, marks, weekStart }: {
  db: LocalDb; me: Member; stock: HomeStock[]; vocab: Map<string, Ingredient>; items: ShoppingItem[]; marks: Map<string, ShoppingMark>; weekStart: string;
}) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const query = norm(q);
  const known = new Set(stock.map((s) => s.key));
  const found = query ? [...vocab.values()].filter((v) => !v.pantry && norm(v.item).includes(query) && !known.has(v.item)).slice(0, 8) : [];
  const exact = vocab.get(q.trim().toLowerCase());
  const add = async (a: { item: string | null; title: string; dept: string }) => {
    await setStock(db, me, a, 'have');
    setQ('');
  };
  const out = async (s: HomeStock) => {
    const r = await runOut(db, me, s, { items, marks, weekStart });
    toast({ text: r === 'already' ? `${s.title} уже в списке покупок` : `${s.title} — в списке покупок` });
  };

  const groups = new Map<string, HomeStock[]>();
  for (const s of stock) groups.set(s.dept, [...(groups.get(s.dept) ?? []), s]);
  const sorted = [...groups.entries()].sort(([a], [b]) => deptRank(a) - deptRank(b))
    .map(([dept, list]) => ({ dept, list: list.sort((a, b) => Number(a.state === 'have') - Number(b.state === 'have') || a.title.localeCompare(b.title, 'ru')) }));

  return (
    <>
      <section className="card">
        <label className="field">Что есть дома<input value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} autoComplete="off" placeholder="Например, молоко или порошок" enterKeyHint="done" /></label>
        {query ? (
          <div className="picks" style={{ marginTop: 10 }}>
            {found.map((v) => <button key={v.item} type="button" className="pick" aria-label={`Добавить: ${v.item}`} onClick={() => add({ item: v.item, title: capitalize(v.item), dept: v.dept })}>{capitalize(v.item)}</button>)}
            {exact ? null : (
              <button type="button" className="pick" aria-label={`Добавить «${q.trim()}»`} onClick={() => add({ item: null, title: capitalize(q.trim()), dept: guessDept(q, vocab) })}>+ {q.trim()}</button>
            )}
          </div>
        ) : null}
      </section>
      {sorted.length === 0 ? (
        <section className="card"><p className="note" style={{ margin: 0 }}>Здесь то, что есть дома. Купленное в магазине попадает сюда само, а добавить можно и самим — поиском выше. Кончилось — нажмите «Закончилось», и продукт окажется в списке покупок.</p></section>
      ) : sorted.map((g) => (
        <section className="card" key={g.dept} aria-label={g.dept}>
          <div className="card-h"><h2>{g.dept}</h2></div>
          {g.list.map((s) => (
            <div className={`row ${s.state === 'out' ? 'stock-out' : ''}`} key={s.key}>
              <span className="row-main"><b>{s.title}</b><small>{s.state === 'have' ? 'есть' : 'закончилось · в покупках'}</small></span>
              {s.state === 'have'
                ? <button type="button" className="btn soft sm" aria-label={`${s.title}: закончилось`} onClick={() => out(s)}>Закончилось</button>
                : <button type="button" className="btn soft sm" aria-label={`${s.title}: есть`} onClick={() => setStock(db, me, s, 'have')}>Есть</button>}
              <button type="button" className="more" aria-label={`${s.title}: убрать из «Дома»`} onClick={() => removeStock(db, s)}>Убрать</button>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
