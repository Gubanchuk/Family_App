import { describe, expect, it } from 'vitest';
import { listText } from './listText';

describe('listText', () => {
  it('lists what is left to buy by department', () => {
    expect(listText('Покупки на 12–18 октября', [
      { title: 'Молоко', qty_text: '2 л', dept: 'Молочное и яйца', urgent: true },
      { title: 'Картофель', qty_text: '3 кг', dept: 'Овощи и фрукты', urgent: false },
      { title: 'Батарейки', qty_text: '', dept: 'Другое', urgent: false },
    ])).toBe([
      'Покупки на 12–18 октября', '',
      'Овощи и фрукты', '— Картофель, 3 кг', '',
      'Молочное и яйца', '— Молоко, 2 л (срочно)', '',
      'Другое', '— Батарейки',
    ].join('\n'));
  });
});
