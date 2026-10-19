import type { Recipe, TemplateSlot } from '../../data/db';
import { usePhotoUrl } from '../family/avatarUrls';
import Icon from '../shell/Icon';

// A small square photo beside a dish name; without one a quiet plate keeps the rows in line,
// unless the place has no row to keep (hideEmpty).
export function DishThumb({ recipe, hideEmpty = false }: { recipe?: Recipe | null; hideEmpty?: boolean }) {
  const src = usePhotoUrl(recipe?.photo_path);
  if (hideEmpty && !recipe?.photo_path) return null;
  return <span className="thumb" aria-hidden="true">{src ? <img src={src} alt="" loading="lazy" /> : <Icon name="menu" />}</span>;
}

function CoverCell({ recipe }: { recipe: Recipe }) {
  const src = usePhotoUrl(recipe.photo_path);
  return src ? <img src={src} alt="" loading="lazy" /> : <span />;
}

// The dishes that show a week best: dinners from Monday on, then lunches; each dish once, only those with a photo.
export function coverDishes(slots: TemplateSlot[], recipes: Map<string, Recipe>, n = 3): Recipe[] {
  const order = [...slots].sort((a, b) => Number(a.meal !== 'dinner') - Number(b.meal !== 'dinner') || Number(a.meal !== 'lunch') - Number(b.meal !== 'lunch') || a.day - b.day);
  const out: Recipe[] = [];
  for (const s of order) {
    const r = s.dish_id ? recipes.get(s.dish_id) : undefined;
    if (r?.photo_path && !out.some((x) => x.id === r.id)) out.push(r);
    if (out.length === n) break;
  }
  return out;
}

// A week's face, made of its own dishes: one large photo and two small ones beside it.
export function WeekCover({ dishes }: { dishes: Recipe[] }) {
  if (!dishes.length) return null;
  return (
    <span className={`week-cover n${dishes.length}`} aria-hidden="true">
      {dishes.map((r) => <CoverCell key={r.id} recipe={r} />)}
    </span>
  );
}
