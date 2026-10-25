// Where the assistant was opened from, and the questions it offers there. A child sees no money questions.
export type Screen = 'home' | 'menu' | 'shop' | 'board' | 'money';

export const SCREEN_NAME: Record<Screen, string> = { home: 'Главная', menu: 'Меню', shop: 'Покупки', board: 'Доска', money: 'Деньги' };

const BY_SCREEN: Record<Screen, string[]> = {
  home: ['Что приготовить на ужин из того, что есть дома?', 'Что у нас сегодня по делам?', 'Чем занять малыша дома в дождь?'],
  menu: ['Что приготовить из того, что есть дома?', 'Подбери быстрый ужин, чтобы и малыш поел', 'Чем заменить блюдо, если кто-то его не ест?'],
  shop: ['Добавь в поход всё, чего не хватает на завтрашний ужин', 'Во сколько примерно выйдет поход?', 'Что можно убрать из похода, чтобы сэкономить?'],
  board: ['Что из дел самое срочное?', 'Какие просьбы висят без ответа?', 'Что подарить из хотелок детей?'],
  money: ['На что в этом месяце ушло больше всего?', 'Какие платежи скоро?', 'Внеси чек — сейчас пришлю фото'],
};

export function suggestionsFor(screen: Screen, role: 'parent' | 'child'): string[] {
  if (role === 'child' && screen === 'money') return BY_SCREEN.home;
  return BY_SCREEN[screen];
}

export const asScreen = (s: string | null): Screen => (s && s in BY_SCREEN ? (s as Screen) : 'home');
