import { expect, test } from '@playwright/test';
import { familyOfTwo, setCurrentWeek, tab } from './family.ts';

test('a dish mom offers to the son shows on his Home, and his «Сделаю» shows on hers', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  // Today's offers are listed under «Сегодня едим», which needs a week.
  await setCurrentWeek(mom.page);

  await mom.page.getByRole('tab', { name: 'Что покушать' }).click();
  await mom.page.locator('.idea').first().click();
  const sheet = mom.page.getByRole('dialog');
  const dish = (await sheet.getAttribute('aria-label'))!;
  await sheet.getByRole('button', { name: 'Сын', exact: true }).click();
  await sheet.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await sheet.getByRole('button', { name: 'Предложить', exact: true }).click();

  const main = son.page.getByRole('region', { name: 'Главное сейчас' });
  await expect(main.getByRole('heading', { name: `Мама просит: ${dish}` })).toBeVisible();
  await main.getByRole('button', { name: 'Сделаю' }).click();

  await tab(mom.page, 'Главная');
  await expect(mom.page.locator('.row.offer', { hasText: dish })).toContainText('готовит Сын');
  await tab(mom.page, 'Покупки');
  await expect(mom.page.getByText(`к блюду «${dish}»`).first()).toBeVisible();

  await mom.close();
  await son.close();
});
