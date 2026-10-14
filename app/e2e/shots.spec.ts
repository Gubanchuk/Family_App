import { expect, test, type Page } from '@playwright/test';
import { inviteLink, phone, signUp, startFamily, tab } from './family.ts';

// Screenshots of every «create» flow for a design review: SHOTS_DIR=<folder> npm run e2e -- shots.
// Without SHOTS_DIR the suite skips it.
const DIR = process.env.SHOTS_DIR ?? '';
const shot = async (page: Page, name: string, full = false) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png`, scale: 'css', fullPage: full });
};

test('screens of the create flows', async ({ browser }) => {
  test.skip(!DIR, 'set SHOTS_DIR to capture the screens');
  test.setTimeout(600_000);
  const mom = await phone(browser);
  const p = mom.page;
  await p.goto('/');
  await expect(p.getByRole('button', { name: 'Войти через Google' })).toBeVisible();
  await shot(p, '01-signin');
  await p.getByRole('button', { name: 'Первый раз? Создать вход по почте' }).click();
  await shot(p, '02-signup');
  await p.getByLabel('Почта').fill('mama-shots@example.com');
  await p.getByLabel('Пароль').fill('123');
  await p.getByRole('button', { name: 'Создать вход' }).click();
  await shot(p, '02b-signup-short-password');

  await startFamily(p, 'Мама').catch(async () => { await shot(p, '03-onboarding-error'); throw new Error('onboarding'); });
  await shot(p, '04-home-new-family', true);

  // Onboarding screen itself, from a second account that is not in a family yet.
  const solo = await phone(browser);
  await signUp(solo.page);
  await expect(solo.page.getByRole('heading', { name: 'Создать семью' })).toBeVisible();
  await shot(solo.page, '03-onboarding');
  await solo.page.getByLabel('Как вас называть').fill('Мама');
  await solo.page.getByRole('button', { name: 'Розовый' }).click();
  await shot(solo.page, '03b-onboarding-filled');
  await solo.close();

  await p.getByRole('link', { name: 'Настройки и профиль' }).click();
  await shot(p, '05-settings', true);
  await p.getByRole('button', { name: 'Изменить' }).click();
  await shot(p, '05b-profile-sheet');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await tab(p, 'Главная');
  const link = await inviteLink(p, 'child');
  await p.getByRole('link', { name: 'Настройки и профиль' }).click();
  await p.getByRole('button', { name: /^Пригласить ребёнка/ }).click();
  await expect(p.getByText('Ссылка для ребёнка')).toBeVisible();
  await shot(p, '06-invite-link', true);
  await p.getByRole('button', { name: /^Добавить малыша/ }).click();
  await shot(p, '06b-toddler-sheet');
  await p.getByLabel('Имя').fill('Дима');
  await p.getByRole('button', { name: 'Добавить в семью' }).click();
  await p.waitForTimeout(400);
  await shot(p, '06c-after-toddler');
  await p.getByRole('button', { name: /^Не едим/ }).click();
  await shot(p, '07-not-eat');
  await p.getByLabel('Продукт или блюдо').fill('грибы');
  await p.getByRole('button', { name: 'Добавить', exact: true }).click();
  await shot(p, '07b-not-eat-added');
  await p.getByRole('button', { name: 'Закрыть' }).click();

  const son = await phone(browser);
  await son.page.goto(link);
  await expect(son.page.getByRole('button', { name: 'Войти через Google' })).toBeVisible();
  await shot(son.page, '08-invite-opened-signin');
  await son.page.getByLabel('Почта').fill(`son-shots-${Date.now()}@example.com`);
  await son.page.getByLabel('Пароль').fill('e2e-pass-12345');
  await son.page.getByRole('button', { name: 'Создать вход' }).click();
  await expect(son.page.getByRole('heading', { name: 'Вас пригласили в семью' })).toBeVisible();
  await shot(son.page, '09-accept-invite');
  await son.page.getByLabel('Как вас называть').fill('Сын');
  await son.page.getByRole('button', { name: 'Вступить' }).click();
  await expect(son.page.getByRole('heading', { level: 1, name: /, Сын$/ })).toBeVisible();
  await shot(son.page, '10-son-home', true);

  await tab(p, 'Меню');
  await shot(p, '11-menu-no-week', true);
  await p.getByRole('button', { name: 'Выбрать неделю' }).click();
  await expect(p.getByRole('dialog').getByRole('button', { name: /^Поставить неделю «/ })).toBeEnabled();
  await shot(p, '12-week-sheet');
  await p.getByRole('dialog').getByRole('button', { name: /^Поставить неделю «/ }).click();
  await expect(p.getByText(/· утверждена$/)).toBeVisible();
  await shot(p, '13-menu-week-toast');
  await p.waitForTimeout(4600);
  await shot(p, '13b-menu-week', true);
  await p.locator('.meal-row').nth(3).click();
  await shot(p, '14-slot-sheet');
  await p.getByRole('tab', { name: 'Все рецепты' }).click();
  await shot(p, '14b-slot-all-recipes');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await p.getByRole('button', { name: 'Заменить день' }).click();
  await shot(p, '15-day-sheet');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await p.getByRole('button', { name: 'Сохранить неделю как шаблон' }).click();
  await shot(p, '16-save-template');
  await p.getByRole('button', { name: 'Закрыть' }).click();

  await tab(son.page, 'Меню');
  await son.page.getByRole('button', { name: 'Следующая неделя' }).click();
  await son.page.waitForTimeout(800);
  await shot(son.page, '17-son-propose-next-week');
  await son.page.getByRole('button', { name: 'Закрыть' }).click();

  await p.getByRole('tab', { name: 'Что покушать' }).click();
  await shot(p, '18-ideas', true);
  await p.locator('.idea').nth(2).click();
  await shot(p, '19-recipe-offer');
  await p.getByRole('dialog').getByRole('button', { name: 'Сын', exact: true }).click();
  await shot(p, '19b-recipe-offer-picked');
  await p.getByRole('dialog').getByRole('button', { name: 'Предложить', exact: true }).click();
  await p.waitForTimeout(1000);
  await shot(p, '20-after-offer', true);

  await tab(p, 'Покупки');
  await shot(p, '21-shop', true);
  await p.getByRole('button', { name: 'Добавить' }).click();
  await shot(p, '22-add-item');
  await p.getByLabel('Что купить').fill('Хлеб');
  await p.getByLabel('Сколько').fill('1 батон');
  await p.getByRole('switch', { name: 'Срочно' }).click();
  await shot(p, '22b-add-item-filled');
  await p.getByRole('dialog').getByRole('button', { name: 'Добавить в список' }).click();
  await p.waitForTimeout(800);
  await shot(p, '23-shop-with-manual', true);
  await p.locator('.amount-btn').first().click();
  await shot(p, '24-item-sheet');
  await p.getByRole('button', { name: 'Закрыть' }).click();

  await tab(son.page, 'Главная');
  await son.page.waitForTimeout(3000);
  await shot(son.page, '25-son-home-offer', true);

  // Night theme for the same key moments.
  await p.emulateMedia({ colorScheme: 'dark' });
  await tab(p, 'Меню');
  await p.getByRole('button', { name: 'Сменить' }).click();
  await shot(p, '26-dark-week-sheet');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await tab(p, 'Покупки');
  await p.getByRole('button', { name: 'Добавить' }).click();
  await shot(p, '27-dark-add-item');
  await p.getByRole('button', { name: 'Закрыть' }).click();
  await tab(p, 'Главная');
  await shot(p, '28-dark-home', true);

  await mom.close();
  await son.close();
});
