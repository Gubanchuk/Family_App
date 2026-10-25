import { expect, test } from '@playwright/test';
import { familyOfTwo, listHead, listSize, tab } from './family.ts';

test('a week the son proposes and mom approves builds the same shopping list on both phones', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);

  await tab(son.page, 'Меню');
  await son.page.getByRole('button', { name: 'Предложить неделю' }).click();
  const propose = son.page.getByRole('dialog').getByRole('button', { name: /^Предложить неделю «/ });
  await expect(propose).toBeEnabled();
  await propose.click();
  // The proposer has nothing more to do: a short card waits for the parents.
  await expect(son.page.getByText(/вы предложили, ждём родителей/)).toBeVisible();

  await tab(mom.page, 'Меню');
  await expect(mom.page.getByRole('heading', { name: /^Сын предлагает неделю/ })).toBeVisible();
  await expect(mom.page.getByText('Голос «за»: Сын.')).toBeVisible();
  await mom.page.getByRole('button', { name: 'Утвердить' }).click();
  await expect(mom.page.getByText(/утверждена, список покупок собран/)).toBeVisible();

  await tab(mom.page, 'Покупки');
  const size = await listSize(mom.page);
  await tab(son.page, 'Покупки');
  await son.page.getByRole('tab', { name: 'Весь список' }).click();
  await expect(listHead(son.page)).toHaveText(new RegExp(`^Осталось ${size} ·`));

  await mom.close();
  await son.close();
});
