import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { CATEGORY_NAME, emptyDraft, missingOf, rowReady, type Category, type Draft, type DraftRow } from './recipeDraft';
import { saveRecipe } from './recipeApi';
import { norm } from './search';
import { useFeature } from '../../data/useFeature';
import PhotoField from '../shell/PhotoField';
import { dropOldPhoto, photoPathFor, type PhotoEdit } from '../../lib/photos';
import { fetchRecipe, fromPage } from './recipeImport';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Editors open right now, and whether the newest history entry is the editor's own.
let editorsOpen = 0;
const ours = () => !!(history.state as { recipeEditor?: boolean } | null)?.recipeEditor;
const DIMA: Array<[Draft['dima'], string]> = [['ok', 'Можно'], ['adapt', 'С поправкой'], ['skip', 'Нельзя']];

// A family recipe: products come from the app's vocabulary, so lists and prices keep working.
export default function RecipeEditor({ me, db, draft: start, onClose }: { me: Member; db: LocalDb; draft?: Draft; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(start ?? emptyDraft());
  const [first] = useState(() => JSON.stringify(start ?? emptyDraft()));
  // Closing a recipe with something typed in it asks first: a whole recipe is a lot to lose to one tap.
  const [asking, setAsking] = useState(false);
  const hasPhotos = useFeature(db, 'photos');
  const [photo, setPhoto] = useState<PhotoEdit>({ kind: 'keep' });
  // A photo uploaded by a save that failed later is reused by the next try instead of uploading twice.
  const uploaded = useRef<{ file: Blob; path: string } | null>(null);
  const dirty = JSON.stringify(d) !== first || photo.kind !== 'keep';
  const tryClose = () => (dirty && !asking ? setAsking(true) : onClose());
  // The phone's Back button closes the editor like the cross does, asking first when something is typed.
  // A history entry of its own stands in front of the page while the editor is open.
  const back = useRef(() => {});
  back.current = () => {
    if (dirty && !asking) { history.pushState({ recipeEditor: true }, ''); setAsking(true); } else onClose();
  };
  useEffect(() => {
    editorsOpen += 1;
    if (!ours()) history.pushState({ recipeEditor: true }, '');
    const onPop = () => back.current();
    window.addEventListener('popstate', onPop);
    return () => {
      editorsOpen -= 1;
      window.removeEventListener('popstate', onPop);
      // Closed by the cross or by saving: take the editor's history entry away again. The check waits a
      // tick, so a remount right away (React's development double run) keeps its entry.
      setTimeout(() => { if (!editorsOpen && ours()) history.back(); }, 0);
    };
  }, []);
  const missing = missingOf(d);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // «Заполнить по ссылке»: what the page gave, and its lines the vocabulary has no product for.
  const [reading, setReading] = useState(false);
  const [unmatched, setUnmatched] = useState<string[] | null>(null);
  const [readError, setReadError] = useState('');
  const fill = async () => {
    setReading(true);
    setReadError('');
    const page = await fetchRecipe(d.source.trim());
    setReading(false);
    if (!page) { setReadError('Не получилось прочитать рецепт с этой страницы. Заполните вручную.'); return; }
    const { patch, unmatched: rest } = fromPage(page, vocab, d.source.trim());
    set({ ...patch, name: patch.name || d.name });
    setUnmatched(rest);
  };
  const uid = useId();
  // One id for the whole session: a retry after a failed save updates the same recipe instead of adding a twin.
  const [id] = useState(() => start?.id ?? `own-${crypto.randomUUID()}`);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setRow = (i: number, patch: Partial<DraftRow>) => set({ rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const vocab = useLiveQuery(() => db.ingredients.toArray(), [db]) ?? [];
  const unit = new Map(vocab.map((v) => [v.item, v.unit]));
  const query = norm(q);
  const found = query ? vocab.filter((v) => norm(v.item).includes(query) && !d.rows.some((r) => r.item === v.item)).slice(0, 8) : [];
  const addRow = (item: string) => { set({ rows: [...d.rows, { item, qty: '', toTaste: false, note: '' }] }); setQ(''); };
  const setStep = (i: number, s: string) => set({ steps: d.steps.map((x, j) => (j === i ? s : x)) });
  // The matches appear under the search field, which on a phone sits behind the keyboard and the Save bar.
  const foundRef = useRef<HTMLDivElement>(null);
  useEffect(() => { foundRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [query]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (missing.length) return;
    setBusy(true);
    setError('');
    try {
      let photo_path: string | null | undefined;
      if (hasPhotos) {
        photo_path = photo.kind === 'new' && uploaded.current?.file === photo.file ? uploaded.current.path : await photoPathFor(me.household_id, 'recipes', id, photo);
        if (photo.kind === 'new' && photo_path) uploaded.current = { file: photo.file, path: photo_path };
      }
      const draft = { ...d, id, steps: d.steps.filter((s) => s.trim()) };
      if (photo_path === undefined) await saveRecipe(me.household_id, draft, !start?.id);
      else await saveRecipe(me.household_id, draft, !start?.id, { photo_path });
      await dropOldPhoto(start?.photo, photo_path);
      toast({ text: `Рецепт «${d.name.trim()}» сохранён` });
      onClose();
    } catch (err) {
      setError((err as Error).message === 'offline' ? 'Нет интернета. Рецепт сохранится, когда появится сеть: нажмите «Сохранить» ещё раз.' : 'Не получилось сохранить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={d.id ? 'Изменить рецепт' : 'Свой рецепт'} onClose={tryClose} keepOnBackdrop
      actions={asking ? (
        <div className="leave-ask" role="group" aria-label="Выйти без сохранения?">
          <span>Выйти без сохранения?</span>
          <div className="btns fill">
            <button type="button" className="btn soft" onClick={() => setAsking(false)}>Остаться</button>
            <button type="button" className="btn" onClick={onClose}>Выйти</button>
          </div>
        </div>
      ) : (
        <div className="re-actions">
          {missing.length ? <p className="note re-missing">Нужно: {missing.join(', ')}</p> : null}
          <button type="submit" form="recipe-form" className="btn" disabled={missing.length > 0 || busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      )}>
      {/* Enter on a phone keyboard never saves this long form: in the product search it adds the first match. */}
      <form id="recipe-form" style={{ margin: '0 16px' }} onSubmit={save}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement && !e.nativeEvent.isComposing) e.preventDefault(); }}>
        <div className="re-link">
          <label className="field">Ссылка на рецепт<input value={d.source} onChange={(e) => set({ source: e.target.value })} inputMode="url" placeholder="https://… — можно не писать" /></label>
            <button type="button" className="btn soft" disabled={!/^https?:\/\/\S+\.\S+/.test(d.source.trim()) || reading} onClick={fill}>{reading ? 'Читаем…' : 'Заполнить по ссылке'}</button>
        </div>
        {readError ? <p className="form-error" role="alert">{readError}</p> : null}
        {unmatched ? <p className="note" role="status">{unmatched.length ? `Заполнили. Не нашли в списке продуктов: ${unmatched.join('; ')}. Добавьте их поиском ниже.` : 'Заполнили. Проверьте и сохраните.'}</p> : null}
        <label className="field">Название<input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="Например, мамины сырники" /></label>
        <label className="field">Пара слов о блюде<input value={d.about} onChange={(e) => set({ about: e.target.value })} maxLength={120} placeholder="Можно не писать" /></label>
        {hasPhotos ? <PhotoField path={d.photo} value={photo} onChange={setPhoto} /> : null}
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
              <input inputMode="decimal" value={r.qty} disabled={r.toTaste} aria-invalid={!rowReady(r)} onChange={(e) => setRow(i, { qty: e.target.value })} placeholder={r.toTaste ? 'по вкусу' : '0'} />
            </label>
            <label className="re-check"><input type="checkbox" checked={r.toTaste} aria-label={`${cap(r.item)}: по вкусу`} onChange={(e) => setRow(i, { toTaste: e.target.checked })} />по вкусу</label>
            <button type="button" className="more" aria-label={`Убрать: ${r.item}`} onClick={() => set({ rows: d.rows.filter((_, j) => j !== i) })}>Убрать</button>
            <input className="re-note" value={r.note} onChange={(e) => setRow(i, { note: e.target.value })} maxLength={40} aria-label={`${cap(r.item)}: пометка`} placeholder={i === 0 ? 'Пометка, например «9%» или «спелые»' : 'Пометка'} />
          </div>
        ))}
        <label className="field">Найти продукт<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например, творог" autoComplete="off" enterKeyHint="search"
          onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) addRow(found[0].item); }} /></label>
        {found.length ? (
          <div className="picks re-found" ref={foundRef}>{found.map((v) => <button key={v.item} type="button" className="pick" aria-label={`Добавить: ${v.item}`} onClick={() => addRow(v.item)}>{cap(v.item)}</button>)}</div>
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
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </form>
    </Sheet>
  );
}
