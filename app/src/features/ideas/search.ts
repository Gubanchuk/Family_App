import type { NotEat, Recipe } from '../../data/db';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

export function recipeMatches(q: string, r: Pick<Recipe, 'name' | 'about'>, items: string[]): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${r.name} ${r.about} ${items.join(' ')}`);
  return words.every((w) => hay.includes(w));
}

// A product matches as a whole word at the start: «курица» blocks «курица целая», «печень» does not block «печенье».
export function blockedBy(r: Pick<Recipe, 'id' | 'name'>, items: string[], notEat: NotEat[]): string | null {
  for (const x of notEat) {
    if (x.deleted_at) continue;
    if (x.kind === 'dish' && x.ref === r.id) return r.name;
    const ref = norm(x.ref);
    const name = norm(r.name);
    // «Не едим» takes products and dish names alike: «сырники» hides «Сырники с изюмом» too.
    if (x.kind === 'item' && (items.some((i) => norm(i) === ref || norm(i).startsWith(`${ref} `)) || name === ref || name.startsWith(`${ref} `))) return x.ref;
  }
  return null;
}
