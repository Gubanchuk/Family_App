import { expect, test } from '@playwright/test';
import { familyOfTwo, tab } from './family.ts';

test('mom asks the son, he answers «Хорошо» on Home, ticks it, and mom sees each step', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  for (const p of [mom.page, son.page]) await expect(p.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' })).toBeVisible({ timeout: 30_000 });
  await mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  await mom.page.getByRole('tab', { name: 'Просьбы' }).click();
  await mom.page.getByRole('button', { name: 'Добавить' }).click();
  await mom.page.getByLabel('О чём просим').fill('Вынести мусор');
  await mom.page.getByRole('button', { name: 'Сын', exact: true }).click();
  await mom.page.getByRole('button', { name: 'Попросить' }).click();
  await expect(son.page.getByRole('heading', { name: 'Мама просит: Вынести мусор' })).toBeVisible({ timeout: 30_000 });
  await expect(mom.page.getByText('Сын · ждёт ответа · сегодня')).toBeVisible();
  // A new request is answered first; only a taken one can be ticked.
  await son.page.getByRole('button', { name: 'Хорошо' }).click();
  await expect(mom.page.getByText('Сын · сделает · сегодня')).toBeVisible({ timeout: 30_000 });
  await son.page.getByRole('button', { name: 'Сделано' }).click();
  await expect(mom.page.getByText('Сын · сделано')).toBeVisible({ timeout: 30_000 });
  await mom.close();
  await son.close();
});

test('a wish gets a secret gift mark the child never sees', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await expect(son.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' })).toBeVisible({ timeout: 30_000 });
  await son.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  // Home has its own «Добавить» and «Добавить сторис»: wait for the Board before pressing it.
  await expect(son.page.getByRole('heading', { level: 1, name: 'Доска' })).toBeVisible();
  await son.page.getByRole('button', { name: 'Добавить', exact: true }).click();
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
  await mom.page.getByRole('group', { name: 'Для кого' }).getByRole('button', { name: 'Сын', exact: true }).click();
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await mom.page.getByRole('button', { name: 'Зимние ботинки: в покупки' }).click();
  await tab(son.page, 'Покупки');
  // A thing to buy from the Board goes to the whole list (into the trip only while someone is in the shop).
  await son.page.getByRole('tab', { name: 'Весь список' }).click();
  await expect(son.page.getByText('Зимние ботинки')).toBeVisible({ timeout: 30_000 });
  await mom.close();
  await son.close();
});

test('a surprise to buy stays off the phone of the son', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await expect(mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' })).toBeVisible({ timeout: 30_000 });
  await mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  await mom.page.getByRole('tab', { name: 'Надо купить' }).click();
  const add = async (title: string, seen: string) => {
    await mom.page.getByRole('button', { name: 'Добавить' }).click();
    await mom.page.getByLabel('Что купить').fill(title);
    await mom.page.getByRole('group', { name: 'Кто видит' }).getByRole('button', { name: seen }).click();
    await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  };
  await add('Торт на день рождения', 'Только я');
  await expect(mom.page.getByText('только вы')).toBeVisible();
  // Sent after the surprise: once it reaches the son, the surprise has reached the server too.
  await add('Батарейки', 'Вся семья');
  await son.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Доска' }).click();
  await son.page.getByRole('tab', { name: 'Надо купить' }).click();
  await expect(son.page.getByText('Батарейки')).toBeVisible({ timeout: 30_000 });
  await son.page.reload();
  await expect(son.page.getByText('Батарейки')).toBeVisible({ timeout: 30_000 });
  await expect(son.page.getByText('Торт на день рождения')).toHaveCount(0);
  await mom.close();
  await son.close();
});
