import { expect, test } from '@playwright/test';
import { familyOfTwo, listHead, listSize, setCurrentWeek, tab } from './family.ts';

test('a mark made offline reaches the other phone once the network is back, and marks travel both ways', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await setCurrentWeek(mom.page);
  await tab(mom.page, 'Покупки');
  const size = await listSize(mom.page);
  await tab(son.page, 'Покупки');
  await expect(listHead(son.page)).toHaveText(`Отмечено 0 из ${size}`);

  const rows = son.page.locator('.row-btn');
  const first = (await rows.first().getAttribute('aria-label'))!;
  const second = (await rows.nth(1).getAttribute('aria-label'))!;

  await son.offline(true);
  await son.page.getByRole('button', { name: first, exact: true }).click();
  await expect(son.page.getByRole('button', { name: first, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(listHead(son.page)).toHaveText(`Отмечено 1 из ${size}`);
  // While the son is offline nothing can reach mom.
  await mom.page.waitForTimeout(5_000);
  await expect(listHead(mom.page)).toHaveText(`Отмечено 0 из ${size}`);

  await son.offline(false);
  await expect(mom.page.getByRole('button', { name: first, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(listHead(mom.page)).toHaveText(`Отмечено 1 из ${size}`);

  await mom.page.getByRole('button', { name: second, exact: true }).click();
  await expect(son.page.getByRole('button', { name: second, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(listHead(son.page)).toHaveText(`Отмечено 2 из ${size}`);

  await mom.close();
  await son.close();
});
