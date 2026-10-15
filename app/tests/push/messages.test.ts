// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compose, eventVersion, isStale, verbFor } from '../../../supabase/functions/_shared/messages';

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

  it('versions a week proposal by template and author, so a new proposal is pushed again', () => {
    expect(eventVersion('weeks', { template_id: 'quick', proposed_by: 'm1' })).toBe('quick:m1');
    expect(eventVersion('dish_offers', { id: 'x' })).toBe('');
  });
  it('drops news that is already stale', () => {
    const now = Date.parse('2026-10-13T15:00:00Z');
    expect(isStale('shop_trips', { started_at: '2026-10-13T13:30:00Z' }, now)).toBe(true);
    expect(isStale('shop_trips', { started_at: '2026-10-13T14:30:00Z' }, now)).toBe(false);
    expect(isStale('dish_offers', { on_date: '2026-10-12' }, now)).toBe(true);
    expect(isStale('dish_offers', { on_date: '2026-10-13' }, now)).toBe(false);
  });

  it('announces a story with the verb that fits who posted it', () => {
    expect(compose({ kind: 'stories', author: 'Мама', verb: 'выложила' }, '2026-10-15')).toMatchObject({ title: 'Мама выложила сторис', url: '/', pref: 'stories' });
    expect(compose({ kind: 'stories', author: 'Тёма', verb: null }, '2026-10-15').title).toBe('Новая сторис от Тёма');
    expect(verbFor('son')).toBe('выложил');
    expect(verbFor('grandmother')).toBe('выложила');
    expect(verbFor(null)).toBeNull();
  });

  it('does not push a story that reached the server an hour late', () => {
    const now = Date.parse('2026-10-15T20:00:00Z');
    expect(isStale('stories', { created_at: '2026-10-15T18:30:00Z' }, now)).toBe(true);
    expect(isStale('stories', { created_at: '2026-10-15T19:30:00Z' }, now)).toBe(false);
  });
  it('tells the recipient about a request and the author when it is done', () => {
    expect(compose({ kind: 'requests', author: 'Оля', title: 'Вынести мусор', status: 'open', verb: null }, '2026-10-15')).toMatchObject({ title: 'Оля просит: Вынести мусор', pref: 'requests', url: '/board?tab=requests' });
    expect(compose({ kind: 'requests', author: 'Тёма', title: 'Вынести мусор', status: 'done', verb: 'сделал' }, '2026-10-15').title).toBe('Тёма сделал: Вынести мусор');
    expect(compose({ kind: 'requests', author: 'Тёма', title: 'Вынести мусор', status: 'done', verb: null }, '2026-10-15').title).toBe('Готово: Вынести мусор (Тёма)');
    expect(eventVersion('requests', { status: 'done' })).toBe('done');
  });
  it('reminds parents of a payment', () => {
    expect(compose({ kind: 'payments_due', title: 'Интернет и ТВ', amount: 650, when: 'soon' }, '2026-10-13')).toMatchObject({ title: 'Через 3 дня платёж: Интернет и ТВ — 650 ₽', url: '/money', pref: 'payments' });
    expect(compose({ kind: 'payments_due', title: 'Аренда', amount: 45000, when: 'today' }, '2026-10-13').title).toBe('Сегодня платёж: Аренда — 45 000 ₽');
  });
});
