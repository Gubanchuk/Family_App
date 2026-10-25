import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon';

export type TabId = 'home' | 'menu' | 'shop' | 'board' | 'money';
const TABS: Record<TabId, { to: string; label: string; icon: string }> = {
  home: { to: '/', label: 'Главная', icon: 'home' },
  menu: { to: '/menu', label: 'Меню', icon: 'menu' },
  shop: { to: '/shop', label: 'Покупки', icon: 'cart' },
  board: { to: '/board', label: 'Доска', icon: 'board' },
  money: { to: '/money', label: 'Деньги', icon: 'wallet' },
};

// The bar's real height goes to --tabbar-h: screens keep their last row above it, whatever the phone draws.
export default function TabBar({ tabs }: { tabs: TabId[] }) {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const put = () => document.documentElement.style.setProperty('--tabbar-h', `${el.offsetHeight}px`);
    put();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--tabbar-h'); };
  }, []);
  return (
    <nav ref={bar} className="tabbar" style={{ ['--tabs' as string]: tabs.length }} aria-label="Разделы">
      {tabs.map((t) => (
        // NavLink sets aria-current="page" on the active tab, which the .tab styles key on.
        <NavLink key={t} to={TABS[t].to} end className="tab">
          <span className="ic-wrap"><Icon name={TABS[t].icon} /></span><span>{TABS[t].label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
