import { useState } from 'react';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { rub } from '../shop/build';
import { memberName, nextStep, progress, savedIn, stepsDone } from './boardMath';
import GoalSheet from './GoalSheet';
import type { BoardData } from './useBoard';
import type { Goal } from './types';

export default function GoalsPanel({ me, members, db, data, adding, onAdded }: { me: Member; members: Member[]; db: LocalDb; data: BoardData; adding: boolean; onAdded: () => void }) {
  const [open, setOpen] = useState<Goal | null>(null);
  // Family goals first, then personal ones; inside each, the closest to done on top.
  const list = [...data.goals].sort((a, b) => Number(!!a.owner_id) - Number(!!b.owner_id) || progress(savedIn(data.bank, b), b.target) - progress(savedIn(data.bank, a), a.target));
  return (
    <>
      {list.length ? list.map((g) => {
        const [done, all] = stepsDone(g);
        const next = nextStep(g);
        return (
          <section className="card goal" key={g.id}>
            <button type="button" className="wish-open" aria-label={`${g.title}, открыть`} onClick={() => setOpen(g)} />
            <div className="card-h"><h2>{g.title}</h2><span className="pill soft" style={{ ['--h' as string]: 'var(--k-goal)' }}>{g.owner_id ? memberName(members, g.owner_id) : 'Семья'}</span></div>
            <div className="cat-top"><span className="amount">{rub(savedIn(data.bank, g))}</span><span className="note" style={{ margin: 0 }}>из {rub(g.target)}</span></div>
            <span className="bar" style={{ ['--h' as string]: 'var(--k-goal)' }} aria-hidden="true"><i style={{ width: `${progress(savedIn(data.bank, g), g.target) * 100}%` }} /></span>
            {all ? <p className="note">{next ? `Дальше: ${next} · шагов ${done} из ${all}` : `Все шаги сделаны · ${all} из ${all}`}</p> : null}
          </section>
        );
      }) : <section className="card"><p className="note" style={{ margin: 0 }}>Целей пока нет. Море, ремонт, велосипед — заведите цель, и копилка покажет, сколько осталось.</p></section>}
      {open || adding ? <GoalSheet me={me} members={members} db={db} goal={open ? data.goals.find((g) => g.id === open.id) ?? open : null} ready={data.depositsReady}
        deposits={open ? data.deposits.filter((d) => d.goal_id === open.id) : []} banked={open ? savedIn(data.bank, data.goals.find((g) => g.id === open.id) ?? open) : undefined}
        onClose={() => { setOpen(null); onAdded(); }} /> : null}
    </>
  );
}
