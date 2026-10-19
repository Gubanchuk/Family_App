import { expect, test, type Page } from '@playwright/test';
import { phone, setCurrentWeek, startFamily, tab } from './family.ts';

// Screens where dishes are chosen by their photos: SHOTS_DIR=<folder> npm run e2e -- pictures.
// Without SHOTS_DIR the suite skips it.
const DIR = process.env.SHOTS_DIR ?? '';
const shot = async (page: Page, name: string) => {
  // Photos load after their links are signed in one batch.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/${name}.png`, scale: 'css' });
};

test('dish photos in the menu and its pickers', async ({ browser }) => {
  test.skip(!DIR, 'set SHOTS_DIR to capture the screens');
  test.setTimeout(300_000);
  const mom = await phone(browser);
  const p = mom.page;
  await startFamily(p, 'Мама');
  await setCurrentWeek(p);
  await shot(p, '01-menu-day');
  await p.getByRole('button', { name: 'Сменить' }).click();
  await expect(p.getByRole('radiogroup', { name: 'Шаблоны недель' })).toBeVisible();
  // The recipe base downloads once after sign-up; the covers need it.
  await expect(p.getByText('Блюдо не загружено')).toHaveCount(0, { timeout: 90_000 });
  await shot(p, '02-week-sheet');
  await p.getByRole('dialog').evaluate((d) => d.scrollBy(0, 900));
  await shot(p, '02b-week-sheet-more');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await p.getByRole('button', { name: 'Заменить ужин' }).click();
  await shot(p, '03-slot-weeks');
  await p.getByRole('tab', { name: 'Все рецепты' }).click();
  await shot(p, '04-slot-all');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await p.getByRole('button', { name: 'Заменить день' }).click();
  await shot(p, '05-day-sheet');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await tab(p, 'Главная');
  await shot(p, '06-home');
  await p.evaluate(() => window.scrollTo(0, 600));
  await shot(p, '06b-home-meals');
  await mom.close();
});
