import { expect, test } from '@playwright/test';
import { familyOfTwo, setCurrentWeek } from './family.ts';

// The path a parent took when the offer buttons were reported to do nothing: an empty next week proposed
// from the hero, then a dish for today instead of lunch.
test('mom offers a dish for today instead of lunch after proposing an empty next week', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await setCurrentWeek(mom.page);
  const hero = mom.page.getByRole('button', { name: 'Выбрать неделю' });
  // The next-week hero shows from Thursday on; earlier in the week it is not there to tap.
  if (await hero.count()) {
    await hero.first().click();
    const weekSheet = mom.page.getByRole('dialog');
    await weekSheet.getByRole('radio', { name: /Без шаблона/ }).click();
    await weekSheet.getByRole('button', { name: /пустую неделю/ }).click();
    await expect(weekSheet).toBeHidden();
  }
  await mom.page.getByRole('tab', { name: 'Что покушать' }).click();
  await mom.page.locator('.idea').nth(1).click();
  const sheet = mom.page.getByRole('dialog');
  const dish = (await sheet.getAttribute('aria-label'))!;
  await sheet.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await sheet.getByRole('button', { name: 'Обед', exact: true }).click();
  await sheet.getByRole('button', { name: /^Вместо/ }).click();
  await sheet.getByRole('button', { name: 'Предложить', exact: true }).click();
  await expect(sheet).toBeHidden();
  await mom.page.getByRole('tab', { name: 'Неделя' }).click();
  await expect(mom.page.locator('.row.offer', { hasText: dish })).toBeVisible();
  await mom.close();
  await son.close();
});
