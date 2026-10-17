import { useState, type FormEvent } from 'react';
import { parseRub, rubOk } from './boardMath';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { removeNeed, saveNeed } from './boardActions';
import type { Need } from './types';
import { useLiveQuery } from 'dexie-react-hooks';
import { useFeature } from '../../data/useFeature';
import { NON_FOOD_DEPTS, guessDept } from '../shop/shopActions';
import { DEPT_ORDER } from '../shop/build';
import SeenBy, { seenToSave } from './SeenBy';


export default function NeedSheet({ me, members, db, need, onClose }: { me: Member; members: Member[]; db: LocalDb; need: Need | null; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(need?.title ?? '');
  const [forId, setFor] = useState<string | null>(need ? need.for_id : null);
  const [note, setNote] = useState(need?.note ?? '');
  const [due, setDue] = useState(need?.due_on ?? '');
  const [price, setPrice] = useState(need?.price ? String(need.price) : '');
  // The department follows the name until someone picks one, like in the shopping list.
  const hasDept = useFeature(db, 'needDept');
  const hasSeen = useFeature(db, 'visibility');
  const [seen, setSeen] = useState<string[] | null>(need?.visible_to ?? null);
  const vocab = useLiveQuery(async () => new Map((await db.ingredients.toArray()).map((v) => [v.item, v])), [db]);
  const [picked, setPicked] = useState<string | null>(need?.dept ?? null);
  const [allDepts, setAllDepts] = useState(false);
  const guessed = title.trim() && vocab ? guessDept(title, vocab) : null;
  const dept = picked ?? (guessed && guessed !== 'Другое' ? guessed : forId ? 'Другое' : 'Для дома');
  const depts = allDepts ? DEPT_ORDER : [...new Set([dept, ...NON_FOOD_DEPTS])];
  const save = async (e: FormEvent) => {
    e.preventDefault();
    await saveNeed(db, me, { id: need?.id, for_id: forId, title, note, due_on: due || null, price: parseRub(price), ...(hasDept ? { dept } : {}), ...(hasSeen ? { visible_to: seenToSave(seen, me, need?.created_by ?? me.id) } : {}) }, need ?? undefined);
    toast({ text: need ? 'Сохранено' : `«${title.trim()}» на доске` });
    onClose();
  };
  return (
    <Sheet title={need ? 'Изменить' : 'Надо купить'} onClose={onClose} keepOnBackdrop={!!title.trim() && !need}
      actions={<button type="submit" form="need-form" className="btn" disabled={!title.trim() || !rubOk(price)}>Сохранить</button>}>
      <form id="need-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Что купить<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus={!need} placeholder="Например, зимние ботинки" /></label>
        <fieldset className="kin-pick">
          <legend>Для кого</legend>
          <div className="picks">
            <button type="button" className="pick" aria-pressed={forId === null} onClick={() => setFor(null)}>Для дома</button>
            {members.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={forId === m.id} onClick={() => setFor(m.id)}>{m.name}</button>)}
          </div>
        </fieldset>
        {hasDept && title.trim() ? (
          <fieldset className="kin-pick"><legend>Отдел</legend><div className="picks">
            {depts.map((d) => <button key={d} type="button" className="pick" aria-pressed={dept === d} onClick={() => setPicked(d)}>{d}</button>)}
            {allDepts ? null : <button type="button" className="pick more-pick" onClick={() => setAllDepts(true)}>Все отделы</button>}
          </div></fieldset>
        ) : null}
        <label className="field">Пометка<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={40} placeholder="Размер, рост, цвет" /></label>
        <label className="field">К какому числу<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="field">Примерно стоит, ₽<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Можно не писать" /></label>
        {hasSeen ? <SeenBy me={me} members={members} author={need?.created_by ?? me.id} value={seen} onChange={setSeen} /> : null}
        {hasSeen && seen ? <p className="note" style={{ margin: '-6px 0 14px' }}>В списке покупок эту строку увидит вся семья.</p> : null}
        {need ? <button type="button" className="more" onClick={async () => { await removeNeed(db, need); toast({ text: 'Удалено' }); onClose(); }}>Удалить</button> : null}
      </form>
    </Sheet>
  );
}
