import { expect, test } from '@playwright/test';
import { phone, startFamily, tab } from './family.ts';

// «Поход» shows only once the server has shopping_items.in_trip (migration 20261025000200); skipped before that.
test('mom puts products in the trip with amounts, goes to the shop and ticks them into the cart', async ({ browser }) => {
  const mom = await phone(browser);
  await startFamily(mom.page, 'Оля');
  await tab(mom.page, 'Покупки');
  const tripTab = mom.page.getByRole('tab', { name: 'Поход' });
  await mom.page.waitForTimeout(3000);
  test.skip(!(await tripTab.isVisible()), 'the trip column is not on the server yet');

  await mom.page.getByRole('button', { name: 'Найти и добавить товар' }).click();
  const sheet = mom.page.getByRole('dialog', { name: 'Добавить товар' });
  await sheet.getByRole('textbox').fill('картоф');
  await sheet.getByRole('button', { name: /^Картофель/ }).click();
  await sheet.getByRole('button', { name: /^Больше: Картофель/ }).click();
  await expect(sheet.getByRole('group', { name: 'Картофель: количество' })).toContainText('1 кг');
  await sheet.getByRole('button', { name: /^Добавить/ }).click();
  await expect(sheet.getByRole('status')).toContainText('«Картофель» в походе');
  await sheet.getByRole('button', { name: 'Закрыть' }).click();

  const sum = mom.page.getByRole('region', { name: 'Итог похода' });
  await expect(sum).toContainText('В походе 1 товар');
  await mom.page.getByRole('button', { name: /Иду в магазин/ }).click();
  await expect(sum).toContainText('В корзине 0 из 1');
  await mom.page.getByRole('button', { name: /^Картофель, 1 кг/ }).click();
  await expect(sum).toContainText('В корзине 1 из 1');
  await mom.page.getByRole('button', { name: /Закончить/ }).click();
  await expect(mom.page.getByText(/Поход закончен: 1 товар/)).toBeVisible();
  await mom.close();
});
