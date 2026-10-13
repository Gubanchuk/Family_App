import { NavLink } from 'react-router-dom';
import Icon from './Icon';

export type TabId = 'home' | 'menu' | 'shop';
const TABS: Record<TabId, { to: string; label: string; icon: string }> = {
  home: { to: '/', label: 'Главная', icon: 'home' },
  menu: { to: '/menu', label: 'Меню', icon: 'menu' },
  shop: { to: '/shop', label: 'Покупки', icon: 'cart' },
};

export default function TabBar({ tabs }: { tabs: TabId[] }) {
  return (
    <nav className="tabbar" style={{ ['--tabs' as string]: tabs.length }} aria-label="Разделы">
      {tabs.map((t) => (
        // NavLink sets aria-current="page" on the active tab, which the .tab styles key on.
        <NavLink key={t} to={TABS[t].to} end className="tab">
          <span className="ic-wrap"><Icon name={TABS[t].icon} /></span><span>{TABS[t].label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
