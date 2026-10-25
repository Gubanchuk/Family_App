import { useState } from 'react';

// A long department folds to its count with a tap on its name; the choice stays on this phone.
// A department where everything is bought folds by itself, unless opened again.
const FOLD_KEY = 'fa.shop-folded';
export function useFolds() {
  const [folded, setFolded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const isFolded = (dept: string, done: boolean) => folded.has(dept) || (done && !opened.has(dept));
  const toggle = (dept: string, done: boolean) => {
    const f = new Set(folded);
    const o = new Set(opened);
    if (isFolded(dept, done)) { f.delete(dept); o.add(dept); } else { f.add(dept); o.delete(dept); }
    setFolded(f);
    setOpened(o);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...f])); } catch { /* storage unavailable */ }
  };
  return { isFolded, toggle };
}
