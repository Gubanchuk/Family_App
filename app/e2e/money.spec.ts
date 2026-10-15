import { expect, test } from '@playwright/test';
import { familyOfTwo } from './family.ts';

test('mom adds a payment and an expense; the son has no money tab', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  const money = mom.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Деньги' });
  await expect(money).toBeVisible({ timeout: 30_000 });
  await money.click();
  await mom.page.getByRole('button', { name: /Добавить платёж/ }).click();
  await mom.page.getByLabel('Название').fill('Интернет');
  await mom.page.getByLabel('Сумма, ₽').fill('650');
  await mom.page.getByLabel('Число месяца').fill('28');
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(mom.page.getByText('Интернет').first()).toBeVisible();
  await mom.page.getByRole('button', { name: 'Расход' }).click();
  await mom.page.getByLabel('Сумма, ₽').fill('1200');
  await mom.page.getByRole('button', { name: 'Продукты' }).click();
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(mom.page.getByText('Продукты')).toBeVisible();
  await son.page.reload();
  await expect(son.page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Деньги' })).toHaveCount(0);
  await mom.close();
  await son.close();
});
