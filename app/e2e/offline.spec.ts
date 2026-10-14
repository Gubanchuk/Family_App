import { expect, test } from '@playwright/test';
import { familyOfTwo, listHead, listSize, setCurrentWeek, tab } from './family.ts';

test('a mark made offline reaches the other phone once the network is back, and marks travel both ways', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await setCurrentWeek(mom.page);
  await tab(mom.page, 'Покупки');
  const size = await listSize(mom.page);
  await tab(son.page, 'Покупки');
  await expect(listHead(son.page)).toHaveText(`Отмечено 0 из ${size}`);

  // Lines are found by product: the quantity in the label changes when the family's portions do.
  const rows = son.page.locator('.row-btn');
  const product = async (n: number) => new RegExp(`^${(await rows.nth(n).getAttribute('aria-label'))!.split(',')[0]}(,|$)`);
  const first = await product(0);
  const second = await product(1);

  await son.offline(true);
  await son.page.getByRole('button', { name: first }).click();
  await expect(son.page.getByRole('button', { name: first })).toHaveAttribute('aria-pressed', 'true');
  await expect(listHead(son.page)).toHaveText(`Отмечено 1 из ${size}`);
  // While the son is offline nothing can reach mom.
  await mom.page.waitForTimeout(5_000);
  await expect(listHead(mom.page)).toHaveText(`Отмечено 0 из ${size}`);

  await son.offline(false);
  await expect(mom.page.getByRole('button', { name: first })).toHaveAttribute('aria-pressed', 'true');
  await expect(listHead(mom.page)).toHaveText(`Отмечено 1 из ${size}`);

  await mom.page.getByRole('button', { name: second }).click();
  await expect(son.page.getByRole('button', { name: second })).toHaveAttribute('aria-pressed', 'true');
  await expect(listHead(son.page)).toHaveText(`Отмечено 2 из ${size}`);

  await mom.close();
  await son.close();
});
