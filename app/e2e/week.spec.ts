import { expect, test } from '@playwright/test';
import { familyOfTwo, listHead, listSize, tab } from './family.ts';

test('a week the son proposes and mom approves builds the same shopping list on both phones', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);

  await tab(son.page, 'Меню');
  await son.page.getByRole('button', { name: 'Предложить неделю' }).click();
  const propose = son.page.getByRole('dialog').getByRole('button', { name: /^Предложить неделю «/ });
  await expect(propose).toBeEnabled();
  await propose.click();
  await expect(son.page.getByRole('heading', { name: /^Сын \(вы\) предлагает неделю/ })).toBeVisible();

  await tab(mom.page, 'Меню');
  await expect(mom.page.getByRole('heading', { name: /^Сын предлагает неделю/ })).toBeVisible();
  await expect(mom.page.getByText('Голос «за»: Сын.')).toBeVisible();
  await mom.page.getByRole('button', { name: 'Утвердить' }).click();
  await expect(mom.page.getByText('Утверждено')).toBeVisible();

  await tab(mom.page, 'Покупки');
  const size = await listSize(mom.page);
  await tab(son.page, 'Покупки');
  await expect(listHead(son.page)).toHaveText(`Отмечено 0 из ${size}`);

  await mom.close();
  await son.close();
});
