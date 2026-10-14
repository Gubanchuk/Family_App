// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compose } from '../../../supabase/functions/_shared/messages';

describe('push texts', () => {
  const today = '2026-10-13';
  it('announces a proposed week', () => {
    expect(compose({ kind: 'weeks', author: 'Сын', template: 'Быстрая', startsOn: '2026-10-19' }, today)).toEqual({
      title: 'Сын предлагает меню на 19–25 октября', body: 'Неделя «Быстрая». Проголосуйте в приложении.', url: '/menu', pref: 'votes', tag: 'week-2026-10-19',
    });
  });
  it('announces a dish offer for today or another day', () => {
    expect(compose({ kind: 'dish_offers', author: 'Мама', dish: 'Плов', meal: 'dinner', onDate: '2026-10-13', toAll: false }, today).title).toBe('Мама просит: Плов');
    expect(compose({ kind: 'dish_offers', author: 'Мама', dish: 'Плов', meal: 'dinner', onDate: '2026-10-14', toAll: true }, today).body).toBe('Завтра на ужин. Предложено всем.');
  });
  it('announces a shop trip', () => {
    expect(compose({ kind: 'shop_trips', author: 'Папа' }, today)).toEqual({ title: 'Папа идёт в магазин', body: 'Добавьте в список, что нужно купить.', url: '/shop', pref: 'shop', tag: 'shop' });
  });
});
