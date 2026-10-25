import { expect, test } from '@playwright/test';
import { familyOfTwo, setCurrentWeek, tab } from './family.ts';

// Needs migrations 20261017000900 («Дома») and 20261025000200 («Поход») on the server; skipped before them.
test('mom takes today’s dinner into the trip and shops while the son adds bread; what ran out at home goes into the trip', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await setCurrentWeek(mom.page);
  await tab(mom.page, 'Покупки');
  const tripTab = mom.page.getByRole('tab', { name: 'Поход' });
  try { await expect(tripTab).toBeVisible({ timeout: 30_000 }); } catch { test.skip(true, 'the server has no trip list yet (migration 20261025000200)'); }

  // Today's dinner from the menu goes into the trip, then mom goes to the shop.
  await mom.page.getByRole('button', { name: /На завтрак, обед или ужин/ }).click();
  const sheet = mom.page.getByRole('dialog', { name: 'Взять в поход' });
  await sheet.getByRole('button', { name: 'Сегодня' }).click();
  await sheet.getByRole('button', { name: 'Ужин' }).click();
  await sheet.getByRole('button', { name: /Взять в поход · \d+/ }).click();
  await expect(mom.page.getByRole('region', { name: 'Итог похода' })).toContainText(/В походе [1-9]/);
  await mom.page.getByRole('button', { name: /Иду в магазин/ }).click();
  const first = mom.page.locator('.trip-row .row-btn').first();
  const title = (await first.locator('b').textContent())!;

  // The son sees mom in the shop and adds bread; it lands in her checklist.
  await tab(son.page, 'Покупки');
  await expect(son.page.getByText(/Мама в магазине с \d\d:\d\d/)).toBeVisible({ timeout: 30_000 });
  await son.page.getByRole('button', { name: 'Найти и добавить товар' }).click();
  const picker = son.page.getByRole('dialog', { name: 'Добавить товар' });
  await picker.getByRole('textbox').fill('Батон нарезной');
  await picker.getByRole('button', { name: /Новый товар «Батон нарезной»/ }).click();
  await picker.getByRole('button', { name: /^Добавить/ }).click();
  await expect(picker.getByRole('status')).toContainText('в походе');
  await picker.getByRole('button', { name: 'Закрыть' }).click();
  await expect(mom.page.getByRole('button', { name: /^Батон нарезной,/ })).toBeVisible({ timeout: 30_000 });

  // Mom ticks the first line; the son's list shows it bought.
  await first.click();
  await son.page.getByRole('tab', { name: 'Список' }).click();
  await expect(son.page.getByRole('button', { name: new RegExp(`^${title},`) })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });

  // The bought product is at home; once it runs out it is back in the trip for the son.
  await mom.page.getByRole('button', { name: /^Закончить/ }).click();
  await mom.page.getByRole('tab', { name: 'Дома' }).click();
  await mom.page.getByRole('button', { name: `${title}: закончилось` }).click();
  await son.page.reload();
  await son.page.getByRole('tab', { name: 'Поход' }).click();
  await expect(son.page.getByText(/закончилось дома/).first()).toBeVisible({ timeout: 30_000 });
  await mom.close();
  await son.close();
});
