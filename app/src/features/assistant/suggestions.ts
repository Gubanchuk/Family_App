// Where the assistant was opened from, and the questions it offers there. A child gets questions of his own.
export type Screen = 'home' | 'menu' | 'shop' | 'board' | 'money';

export const SCREEN_NAME: Record<Screen, string> = { home: 'Главная', menu: 'Меню', shop: 'Покупки', board: 'Доска', money: 'Деньги' };

const PARENT: Record<Screen, string[]> = {
  home: ['Что приготовить на ужин из того, что есть дома?', 'Что у нас сегодня по делам?', 'Чем занять малыша дома в дождь?'],
  menu: ['Что приготовить из того, что есть дома?', 'Подбери быстрый ужин, чтобы и малыш поел', 'Чем заменить блюдо, если кто-то его не ест?'],
  shop: ['Добавь в поход всё, чего не хватает на завтрашний ужин', 'Во сколько примерно выйдет поход?', 'Что можно убрать из похода, чтобы сэкономить?'],
  board: ['Что из дел самое срочное?', 'Какие просьбы висят без ответа?', 'Что подарить из хотелок детей?'],
  money: ['На что в этом месяце ушло больше всего?', 'Какие платежи скоро?', 'Внеси чек — сейчас пришлю фото'],
};
const CHILD: Record<Screen, string[]> = {
  home: ['Что вкусного можно приготовить самому?', 'Чем заняться, если скучно?', 'Помоги с уроками'],
  menu: ['Что вкусного можно приготовить самому?', 'Какой перекус сделать после школы?', 'Что на ужин сегодня?'],
  shop: ['Добавь в поход мои любимые хлопья', 'Что купить к чаю?', 'Что уже лежит в походе?'],
  board: ['Как быстрее накопить на хотелку?', 'Какие у меня просьбы?', 'Что подарить маме?'],
  money: ['Что вкусного можно приготовить самому?', 'Чем заняться, если скучно?', 'Помоги с уроками'],
};

export function suggestionsFor(screen: Screen, role: 'parent' | 'child'): string[] {
  return (role === 'child' ? CHILD : PARENT)[screen];
}

// The greeting's example fits the section the person came from.
export const EXAMPLE: Record<Screen, string> = {
  home: 'например, что приготовить из того, что есть дома',
  menu: 'например, подобрать блюдо на ужин',
  shop: 'например, добавить продукты в поход',
  board: 'например, попросить кого-то из семьи',
  money: 'например, внести расход по фото чека',
};

export const asScreen = (s: string | null): Screen => (s && s in PARENT ? (s as Screen) : 'home');
