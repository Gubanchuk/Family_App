import { Link } from 'react-router-dom';
import Sheet from '../menu/Sheet';
import Icon from '../shell/Icon';
import type { Member } from '../family/useFamily';

type Item = { to: string; icon: string; title: string; sub: string; h: string };

// One tap from Home to the form that adds something; each section opens with its form already up.
// Board and money show only once the server has their tables, money only to parents.
export default function QuickAddSheet({ me, board, money: moneyReady, onClose }: { me: Member; board: boolean; money: boolean; onClose: () => void }) {
  const money = moneyReady && me.role === 'parent';
  const items: Item[] = [
    { to: '/shop?add=1', icon: 'cart', title: 'В покупки', sub: 'продукты, порошок, лекарства', h: 'var(--k-shop)' },
    ...(board ? [
      { to: '/board?tab=requests&add=1', icon: 'check', title: 'Попросить', sub: 'кого-то из семьи, к сроку', h: 'var(--k-primary)' },
      { to: '/board?tab=wishes&add=1', icon: 'gift', title: 'Хотелку', sub: 'с копилкой, видно всей семье', h: 'var(--k-money)' },
    ] : []),
    ...(money ? [{ to: '/money?add=expense', icon: 'wallet', title: 'Расход', sub: 'видят только родители', h: 'var(--k-money)' }] : []),
  ];
  return (
    <Sheet title="Что добавить" onClose={onClose}>
      <div style={{ margin: '0 16px 12px' }}>
        {items.map((x) => (
          <Link key={x.to} to={x.to} className="row set-row quick-row" onClick={onClose}>
            <span className="ico" style={{ ['--h' as string]: x.h }} aria-hidden="true"><Icon name={x.icon} /></span>
            <span className="row-main"><b>{x.title}</b><small>{x.sub}</small></span>
          </Link>
        ))}
      </div>
    </Sheet>
  );
}
