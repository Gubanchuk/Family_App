import { useSearchParams } from 'react-router-dom';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import { localDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useBoard } from './useBoard';

export type BoardTab = 'wishes' | 'needs' | 'goals' | 'requests';
const TABS: Array<[BoardTab, string]> = [['wishes', 'Хотелки'], ['needs', 'Надо купить'], ['goals', 'Цели'], ['requests', 'Просьбы']];

export default function BoardPage({ me, members, db = localDb }: { me: Member; members: Member[]; db?: LocalDb }) {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([t]) => t === params.get('tab'))?.[0] ?? 'wishes') as BoardTab;
  const add = params.get('add') === '1';
  const data = useBoard(db, me.household_id);
  const setTab = (t: BoardTab) => setParams({ tab: t }, { replace: true });
  const openAdd = () => setParams({ tab, add: '1' });
  const closeAdd = () => setParams({ tab }, { replace: true });
  return (
    <>
      <Header title="Доска" subtitle="Видно всей семье" action={<button type="button" className="head-pill" onClick={openAdd}><Icon name="plus" />Добавить</button>} />
      <div className="segs" role="tablist" aria-label="Разделы доски">
        {TABS.map(([t, label]) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{label}</button>)}
      </div>
      {data ? <BoardPanel tab={tab} me={me} members={members} db={db} data={data} adding={add} onAdded={closeAdd} /> : null}
    </>
  );
}

function BoardPanel(_p: { tab: BoardTab; me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useBoard>>; adding: boolean; onAdded: () => void }) {
  return <p className="note" style={{ margin: 16 }}>Скоро здесь будет раздел.</p>;
}
