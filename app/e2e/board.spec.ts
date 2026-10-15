import { expect, test } from '@playwright/test';
import { familyOfTwo, tab } from './family.ts';

test('mom asks the son, he sees it on Home and ticks it, mom sees it done', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  for (const p of [mom.page, son.page]) await expect(p.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' })).toBeVisible({ timeout: 30_000 });
  await mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  await mom.page.getByRole('tab', { name: 'Просьбы' }).click();
  await mom.page.getByRole('button', { name: 'Добавить' }).click();
  await mom.page.getByLabel('О чём просим').fill('Вынести мусор');
  await mom.page.getByRole('button', { name: 'Сын', exact: true }).click();
  await mom.page.getByRole('button', { name: 'Попросить' }).click();
  await expect(son.page.getByRole('heading', { name: 'Мама просит: Вынести мусор' })).toBeVisible({ timeout: 30_000 });
  await son.page.getByRole('button', { name: 'Сделано' }).click();
  await expect(mom.page.getByText('сделано')).toBeVisible({ timeout: 30_000 });
  await mom.close();
  await son.close();
});

test('a wish gets a secret gift mark the child never sees', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await expect(son.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' })).toBeVisible({ timeout: 30_000 });
  await son.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  await son.page.getByRole('button', { name: 'Добавить' }).click();
  await son.page.getByLabel('Что хочется').fill('Велосипед');
  await son.page.getByRole('button', { name: 'Сохранить' }).click();
  await mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  await mom.page.getByRole('button', { name: 'Беру в подарок' }).click({ timeout: 30_000 });
  await expect(mom.page.getByText('Подарок от мамы')).toBeVisible();
  await son.page.reload();
  await expect(son.page.getByText('Велосипед')).toBeVisible();
  await expect(son.page.getByText(/Подарок/)).toHaveCount(0);
  await mom.close();
  await son.close();
});

test('a thing to buy goes to the shopping list', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await expect(mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' })).toBeVisible({ timeout: 30_000 });
  await mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  await mom.page.getByRole('tab', { name: 'Надо купить' }).click();
  await mom.page.getByRole('button', { name: 'Добавить' }).click();
  await mom.page.getByLabel('Что купить').fill('Зимние ботинки');
  await mom.page.getByRole('button', { name: 'Сын', exact: true }).click();
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await mom.page.getByRole('button', { name: 'Зимние ботинки: в покупки' }).click();
  await tab(son.page, 'Покупки');
  await expect(son.page.getByText('Зимние ботинки')).toBeVisible({ timeout: 30_000 });
  await mom.close();
  await son.close();
});
