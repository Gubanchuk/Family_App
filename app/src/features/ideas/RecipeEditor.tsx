import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { CATEGORY_NAME, canSave, emptyDraft, type Category, type Draft, type DraftRow } from './recipeDraft';
import { saveRecipe } from './recipeApi';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DIMA: Array<[Draft['dima'], string]> = [['ok', 'Можно'], ['adapt', 'С поправкой'], ['skip', 'Нельзя']];

// A family recipe: products come from the app's vocabulary, so lists and prices keep working.
export default function RecipeEditor({ me, db, draft: start, onClose }: { me: Member; db: LocalDb; draft?: Draft; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(start ?? emptyDraft());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = useId();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setRow = (i: number, patch: Partial<DraftRow>) => set({ rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const vocab = useLiveQuery(() => db.ingredients.toArray(), [db]) ?? [];
  const unit = new Map(vocab.map((v) => [v.item, v.unit]));
  const query = q.trim().toLowerCase();
  const found = query ? vocab.filter((v) => v.item.includes(query) && !d.rows.some((r) => r.item === v.item)).slice(0, 8) : [];
  const setStep = (i: number, s: string) => set({ steps: d.steps.map((x, j) => (j === i ? s : x)) });
  // The matches appear under the search field, which on a phone sits behind the keyboard and the Save bar.
  const foundRef = useRef<HTMLDivElement>(null);
  useEffect(() => { foundRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [query]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave(d)) return;
    setBusy(true);
    setError('');
    try {
      await saveRecipe(me.household_id, { ...d, steps: d.steps.filter((s) => s.trim()) });
      toast({ text: `Рецепт «${d.name.trim()}» сохранён` });
      onClose();
    } catch (err) {
      setError((err as Error).message === 'offline' ? 'Нет интернета. Рецепт сохранится, когда появится сеть: нажмите «Сохранить» ещё раз.' : 'Не получилось сохранить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={d.id ? 'Изменить рецепт' : 'Свой рецепт'} onClose={onClose} keepOnBackdrop
      actions={<button type="submit" form="recipe-form" className="btn" disabled={!canSave(d) || busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
      <form id="recipe-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Название<input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoFocus={!d.id} placeholder="Например, мамины сырники" /></label>
        <label className="field">Пара слов о блюде<input value={d.about} onChange={(e) => set({ about: e.target.value })} maxLength={120} placeholder="Можно не писать" /></label>
        <fieldset className="kin-pick"><legend>Что это</legend><div className="picks">
          {(Object.keys(CATEGORY_NAME) as Category[]).map((c) => <button key={c} type="button" className="pick" aria-pressed={d.category === c} onClick={() => set({ category: c })}>{CATEGORY_NAME[c]}</button>)}
        </div></fieldset>
        <div className="re-pair">
          <label className="field">Время, минут<input inputMode="numeric" value={d.time} onChange={(e) => set({ time: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="30" /></label>
          <label className="field">Порций<input inputMode="numeric" value={d.servings} onChange={(e) => set({ servings: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="4" /></label>
        </div>
        <fieldset className="kin-pick"><legend>Диме</legend><div className="picks">
          {DIMA.map(([v, label]) => <button key={v} type="button" className="pick" aria-pressed={d.dima === v} onClick={() => set({ dima: v })}>{label}</button>)}
        </div></fieldset>
        {d.dima !== 'ok' ? <label className="field">Что именно<input value={d.dimaNote} onChange={(e) => set({ dimaNote: e.target.value })} maxLength={120} placeholder="Например, без перца, мясо мелко" /></label> : null}

        <h3 className="sh-h re-h">Продукты</h3>
        {d.rows.map((r, i) => (
          <div className="re-row" key={r.item}>
            <label className="field">{cap(r.item)}, {unit.get(r.item) ?? 'г'}
              <input inputMode="decimal" value={r.qty} disabled={r.toTaste} onChange={(e) => setRow(i, { qty: e.target.value })} placeholder={r.toTaste ? 'по вкусу' : '0'} />
            </label>
            <label className="re-check"><input type="checkbox" checked={r.toTaste} aria-label={`${cap(r.item)}: по вкусу`} onChange={(e) => setRow(i, { toTaste: e.target.checked })} />по вкусу</label>
            <button type="button" className="more" aria-label={`Убрать: ${r.item}`} onClick={() => set({ rows: d.rows.filter((_, j) => j !== i) })}>Убрать</button>
            <input className="re-note" value={r.note} onChange={(e) => setRow(i, { note: e.target.value })} maxLength={40} aria-label={`${cap(r.item)}: пометка`} placeholder={i === 0 ? 'Пометка, например «9%» или «спелые»' : 'Пометка'} />
          </div>
        ))}
        <label className="field">Найти продукт<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например, творог" autoComplete="off" /></label>
        {found.length ? (
          <div className="picks re-found" ref={foundRef}>{found.map((v) => <button key={v.item} type="button" className="pick" aria-label={`Добавить: ${v.item}`} onClick={() => { set({ rows: [...d.rows, { item: v.item, qty: '', toTaste: false, note: '' }] }); setQ(''); }}>{cap(v.item)}</button>)}</div>
        ) : query ? <p className="note">Нет в списке. Выберите ближайший и уточните в пометке.</p> : null}

        <h3 className="sh-h re-h">Как готовить</h3>
        {d.steps.map((s, i) => (
          <div className="re-step field" key={i}>
            <div className="re-step-head">
              <label htmlFor={`${uid}-step-${i}`}>Шаг {i + 1}</label>
              <span className="btns">
                {i > 0 ? <button type="button" className="more" aria-label={`Шаг ${i + 1} выше`} onClick={() => { const st = [...d.steps]; [st[i - 1], st[i]] = [st[i], st[i - 1]]; set({ steps: st }); }}>Выше</button> : null}
                {d.steps.length > 1 ? <button type="button" className="more" aria-label={`Убрать шаг ${i + 1}`} onClick={() => set({ steps: d.steps.filter((_, j) => j !== i) })}>Убрать</button> : null}
              </span>
            </div>
            <textarea id={`${uid}-step-${i}`} rows={2} value={s} onChange={(e) => setStep(i, e.target.value)} maxLength={300} />
          </div>
        ))}
        <button type="button" className="btn soft sm" onClick={() => set({ steps: [...d.steps, ''] })}>Добавить шаг</button>
        <label className="field">Ссылка на рецепт<input value={d.source} onChange={(e) => set({ source: e.target.value })} inputMode="url" placeholder="Можно не писать" /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </form>
    </Sheet>
  );
}
