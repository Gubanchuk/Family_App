import { MEAL_TIME, type Meal } from '../features/menu/week';

const KEY = 'fa.mealTimes';
export function getMealTimes(): Record<Meal, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...MEAL_TIME, ...(JSON.parse(raw) as Partial<Record<Meal, string>>) };
  } catch { /* storage unavailable */ }
  return { ...MEAL_TIME };
}
export function setMealTimes(t: Record<Meal, string>) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* storage unavailable */ }
}
