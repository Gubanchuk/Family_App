// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isoMinutes, readRecipe, safeUrl } from '../../../supabase/functions/_shared/recipePage';

const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
const at = new URL('https://www.eda.ru/recepty/syrniki-1');

describe('reading a recipe page', () => {
  it('takes a Recipe from JSON-LD, also inside a @graph, with steps of any shape', () => {
    const r = readRecipe(page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, {
      '@type': ['Recipe'], name: 'Сырники &quot;как у бабушки&quot;', recipeYield: ['4', '4 порции'], totalTime: 'PT1H5M',
      recipeIngredient: ['Творог 9% — 500 г', 'Яйца — 2 шт.', 'Соль по вкусу'],
      recipeInstructions: [{ '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Смешать <b>творог</b> и яйца.' }] }, 'Обжарить.'],
    }] }), at);
    expect(r).toEqual({
      name: 'Сырники "как у бабушки"', servings: 4, minutes: 65, site: 'eda.ru',
      ingredients: ['Творог 9% — 500 г', 'Яйца — 2 шт.', 'Соль по вкусу'], steps: ['Смешать творог и яйца.', 'Обжарить.'],
    });
  });

  it('falls back to microdata', () => {
    const html = `<div itemscope itemtype="http://schema.org/Recipe"><h1 itemprop="name">Блины</h1>
      <span itemprop="recipeIngredient">Молоко — 500 мл</span><span itemprop="recipeIngredient">Мука — 200 г</span>
      <div itemprop="recipeInstructions"><p>Смешать.</p></div></div>`;
    expect(readRecipe(html, at)).toMatchObject({ name: 'Блины', ingredients: ['Молоко — 500 мл', 'Мука — 200 г'], steps: ['Смешать.'] });
  });

  it('merges JSON-LD without products with products marked on the page, and drops «Шаг 1:» numbering', () => {
    const html = `${page({ '@type': 'Recipe', name: 'Пшённая каша', recipeInstructions: '<p>Шаг 1: Промыть пшено.</p><p>Шаг 2: Сварить.</p>' })}
      <ul><li itemprop="recipeIngredient">Пшено — 1 стакан</li><li itemprop="recipeIngredient">Молоко — 500 мл</li></ul>`;
    expect(readRecipe(html, at)).toMatchObject({ name: 'Пшённая каша', ingredients: ['Пшено — 1 стакан', 'Молоко — 500 мл'], steps: ['Промыть пшено.', 'Сварить.'] });
  });

  it('gives nothing for a page without a recipe', () => {
    expect(readRecipe('<html><body>Статья</body></html>', at)).toBeNull();
    expect(readRecipe(page({ '@type': 'Article', name: 'x' }), at)).toBeNull();
  });

  it('reads cooking time', () => {
    expect(isoMinutes('PT30M')).toBe(30);
    expect(isoMinutes('PT2H')).toBe(120);
    expect(isoMinutes('30 минут')).toBeNull();
  });

  it('goes only to public web pages', () => {
    expect(safeUrl('https://eda.ru/recepty/1')?.hostname).toBe('eda.ru');
    for (const bad of ['ftp://eda.ru/x', 'http://localhost:3000', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://intranet/', 'не ссылка']) {
      expect(safeUrl(bad)).toBeNull();
    }
  });
});
