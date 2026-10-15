import { expect, test } from '@playwright/test';
import { familyOfTwo, inviteLink, join, phone } from './family.ts';

const tabs = (p: { page: import('@playwright/test').Page }) => p.page.getByRole('navigation', { name: 'Разделы' });

test('mom adds a payment and an expense, dad sees them and marks the payment paid; the son has no money tab', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  const dad = await phone(browser);
  await join(dad.page, await inviteLink(mom.page, 'parent'), 'Папа', 'Папа');

  const money = tabs(mom).getByRole('link', { name: 'Деньги' });
  await expect(money).toBeVisible({ timeout: 30_000 });
  await money.click();
  await mom.page.getByRole('button', { name: /Добавить платёж/ }).click();
  await mom.page.getByLabel('Название').fill('Интернет');
  await mom.page.getByLabel('Сумма, ₽').fill('650');
  await mom.page.getByLabel('Число месяца').fill('28');
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(mom.page.getByRole('button', { name: /^Интернет/ })).toBeVisible();
  await mom.page.getByRole('button', { name: 'Расход' }).click();
  await mom.page.getByLabel('Сумма, ₽').fill('1200');
  await mom.page.getByRole('button', { name: 'Продукты' }).click();
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(mom.page.getByRole('button', { name: /^Продукты · 1/ })).toBeVisible();

  // Dad's phone gets both through sync and marks the payment from the hero card.
  await expect(tabs(dad).getByRole('link', { name: 'Деньги' })).toBeVisible({ timeout: 30_000 });
  await tabs(dad).getByRole('link', { name: 'Деньги' }).click();
  await expect(dad.page.getByRole('button', { name: /^Продукты · 1/ })).toBeVisible({ timeout: 30_000 });
  await expect(dad.page.getByRole('heading', { name: /^Интернет — 650\s₽$/ })).toBeVisible();
  await dad.page.getByRole('button', { name: 'Отметить оплаченным' }).click();
  await expect(dad.page.getByRole('heading', { name: /^Все платежи .+ оплачены$/ })).toBeVisible();
  await expect(mom.page.getByRole('button', { name: /^Интернет.*оплачено/ })).toBeVisible({ timeout: 30_000 });

  await son.page.reload();
  await expect(tabs(son).getByRole('link', { name: 'Меню' })).toBeVisible();
  await expect(tabs(son).getByRole('link', { name: 'Деньги' })).toHaveCount(0);
  await mom.close();
  await dad.close();
  await son.close();
});
