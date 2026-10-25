import { expect, test } from '@playwright/test';
import { phone, startFamily, tab } from './family.ts';

// Talks to the real assistant (Claude through the deployed Edge Function): a few cents of the family's credit.
test('the assistant answers from Home and adds products to the shop by itself', async ({ browser }) => {
  test.setTimeout(240_000);
  const mom = await phone(browser);
  await startFamily(mom.page, 'Оля');
  await mom.page.getByRole('button', { name: /Спросить помощника/ }).click();
  await expect(mom.page.getByRole('heading', { level: 1, name: 'Помощник' })).toBeVisible();
  await mom.page.getByRole('textbox', { name: 'Сообщение помощнику' }).fill('Ответь одним коротким предложением: ты меня слышишь?');
  await mom.page.getByRole('button', { name: 'Отправить' }).click();
  await expect(mom.page.locator('.msg.bot').first()).toBeVisible({ timeout: 90_000 });

  await mom.page.getByRole('textbox', { name: 'Сообщение помощнику' }).fill('Добавь в покупки молоко 1 литр, больше ничего не делай и ничего не спрашивай.');
  await mom.page.getByRole('button', { name: 'Отправить' }).click();
  const card = mom.page.getByRole('group', { name: /Готово: .*молоко/i });
  await expect(card).toBeVisible({ timeout: 120_000 });
  await expect(card.getByRole('button', { name: 'Отменить' })).toBeVisible();

  // Earlier conversations stay in the list.
  await mom.page.getByRole('button', { name: 'Разговоры' }).click();
  await expect(mom.page.getByRole('dialog', { name: 'Разговоры' }).getByText('Ответь одним коротким предложением', { exact: false })).toBeVisible();
  await mom.page.getByRole('button', { name: 'Закрыть' }).click();
  await mom.page.getByRole('button', { name: 'Назад' }).click();
  await tab(mom.page, 'Покупки');
  await expect(mom.page.getByText('Молоко', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await mom.close();
});
