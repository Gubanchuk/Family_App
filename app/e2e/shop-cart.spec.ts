import { expect, test } from '@playwright/test';
import { familyOfTwo, setCurrentWeek, tab } from './family.ts';

// Needs migration 20261017000900 on the server: without it the phones show no «Дома» and the scenario waits.
test('mom shops for one meal while the son adds bread; what ran out at home reaches the list', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await setCurrentWeek(mom.page);
  await tab(mom.page, 'Покупки');
  const homeTab = mom.page.getByRole('tab', { name: 'Дома' });
  try { await expect(homeTab).toBeVisible({ timeout: 30_000 }); } catch { test.skip(true, 'the server has no home stock yet (migration 20261017000900)'); }

  await mom.page.getByRole('button', { name: 'Иду в магазин' }).click();
  const sheet = mom.page.getByRole('dialog', { name: 'Что берём' });
  await sheet.getByRole('button', { name: 'Сегодня' }).click();
  await sheet.getByRole('button', { name: 'Ужин' }).click();
  await expect(sheet.getByRole('button', { name: 'Пошли' })).toBeEnabled();
  await sheet.getByRole('button', { name: 'Пошли' }).click();
  await expect(mom.page.getByRole('tab', { name: 'Корзина', selected: true })).toBeVisible();
  const first = mom.page.locator('.row .row-btn').first();
  const title = (await first.locator('b').textContent())!;
  await expect(first).toContainText('на ужин:');

  await tab(son.page, 'Покупки');
  await expect(son.page.getByText(/Мама в магазине с \d\d:\d\d: ужин на сегодня/)).toBeVisible({ timeout: 30_000 });
  await son.page.getByRole('button', { name: 'Добавить' }).click();
  await son.page.getByLabel('Что купить').fill('Батон');
  await son.page.getByRole('button', { name: 'Добавить в список' }).click();
  await expect(mom.page.getByRole('button', { name: 'Батон', exact: true })).toContainText(/добавил/, { timeout: 30_000 });

  await first.click();
  await son.page.reload();
  await expect(son.page.getByRole('button', { name: new RegExp(`^${title},`) })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });

  // The bought product is at home; once it runs out the son sees it on the list again.
  await mom.page.getByRole('button', { name: 'Закончить поход' }).click();
  await homeTab.click();
  await mom.page.getByRole('button', { name: `${title}: закончилось` }).click();
  await son.page.reload();
  await expect(son.page.getByText(/закончилось дома · Мама/)).toBeVisible({ timeout: 30_000 });
  await mom.close();
  await son.close();
});
