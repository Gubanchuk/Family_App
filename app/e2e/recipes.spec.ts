import { expect, test } from '@playwright/test';
import { familyOfTwo, tab } from './family.ts';

test('a recipe mom adds shows for the son under «Наши рецепты»', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  const name = `Мамины сырники ${Date.now().toString(36)}`;

  await tab(mom.page, 'Меню');
  await mom.page.getByRole('tab', { name: 'Что покушать' }).click();
  await mom.page.getByRole('button', { name: 'Свой рецепт' }).click();
  const editor = mom.page.getByRole('dialog', { name: 'Свой рецепт' });
  await editor.getByLabel('Название').fill(name);
  await editor.getByRole('button', { name: 'Завтрак', exact: true }).click();
  await editor.getByLabel('Порций').fill('4');
  await editor.getByLabel('Найти продукт').fill('творог');
  await editor.getByRole('button', { name: 'Добавить: творог', exact: true }).click();
  await editor.getByLabel(/^Творог, /).fill('500');
  await editor.getByLabel('Шаг 1').fill('Смешать творог с яйцом и обжарить.');
  await editor.getByRole('button', { name: 'Сохранить' }).click();
  await expect(editor).toBeHidden();
  await mom.page.getByRole('button', { name: 'Наши рецепты' }).click();
  await expect(mom.page.getByRole('button', { name: new RegExp(name) })).toBeVisible();

  // The son's phone notices the changed recipe base on its next start.
  await son.page.reload();
  await tab(son.page, 'Меню');
  await son.page.getByRole('tab', { name: 'Что покушать' }).click();
  await son.page.getByRole('button', { name: 'Наши рецепты' }).click();
  await son.page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(son.page.getByRole('dialog', { name })).toContainText('Смешать творог с яйцом и обжарить.');

  await mom.close();
  await son.close();
});

test('base recipes come with their photos', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await tab(mom.page, 'Меню');
  await mom.page.getByRole('tab', { name: 'Что покушать' }).click();
  // Signed links to the private bucket: the picture must actually arrive, not just the <img>.
  const photo = mom.page.locator('img.card-photo').first();
  await expect(photo).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  await mom.close();
  await son.close();
});
