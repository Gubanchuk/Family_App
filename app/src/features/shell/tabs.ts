import type { TabId } from './TabBar';

// Board and money join the bottom tabs once the server has their tables; money is for parents only.
export function tabsFor(role: 'parent' | 'child', boardReady: boolean, moneyReady: boolean): TabId[] {
  return ['home', 'menu', 'shop', ...(boardReady ? ['board' as const] : []), ...(moneyReady && role === 'parent' ? ['money' as const] : [])];
}
