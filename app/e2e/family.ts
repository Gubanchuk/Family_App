import { devices, expect, type Browser, type Page } from '@playwright/test';
import { BASE_URL } from './playwright.config.ts';

const PASSWORD = 'e2e-pass-12345';
const run = Date.now().toString(36);
let count = 0;

export type Phone = { page: Page; offline: (on: boolean) => Promise<void>; close: () => Promise<void> };

// Each family member gets a separate browser context: own storage, own session, own network switch.
export async function phone(browser: Browser): Promise<Phone> {
  const context = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE_URL, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  const page = await context.newPage();
  return { page, offline: (on) => context.setOffline(on), close: () => context.close() };
}

export async function signUp(page: Page, path = '/') {
  count += 1;
  await page.goto(path);
  await page.getByRole('button', { name: 'Первый раз? Создать вход по почте' }).click();
  await page.getByLabel('Почта').fill(`e2e-${run}-${count}@example.com`);
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Создать вход' }).click();
}

const greeted = (page: Page, name: string) => expect(page.getByRole('heading', { level: 1, name: new RegExp(`, ${name}$`) })).toBeVisible();

export async function startFamily(page: Page, name: string) {
  await signUp(page);
  await page.getByLabel('Как вас называть').fill(name);
  await page.getByRole('button', { name: 'Создать семью' }).click();
  await greeted(page, name);
}

export const tab = (page: Page, name: 'Главная' | 'Меню' | 'Покупки') =>
  page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name }).click();

export async function inviteLink(page: Page, role: 'parent' | 'child'): Promise<string> {
  await page.getByRole('link', { name: 'Настройки и профиль' }).click();
  await page.getByRole('button', { name: role === 'child' ? /^Пригласить ребёнка/ : /^Пригласить родителя/ }).click();
  const link = page.getByText(/\/join\?code=/);
  await expect(link).toBeVisible();
  const url = new URL((await link.textContent())!.trim());
  await tab(page, 'Главная');
  return url.pathname + url.search;
}

export async function join(page: Page, invitePath: string, name: string) {
  await signUp(page, invitePath);
  await page.getByLabel('Как вас называть').fill(name);
  await page.getByRole('button', { name: 'Вступить' }).click();
  await greeted(page, name);
}

// Mom creates the family and owns it; Son joins by a child invite.
export async function familyOfTwo(browser: Browser) {
  const mom = await phone(browser);
  await startFamily(mom.page, 'Мама');
  const son = await phone(browser);
  await join(son.page, await inviteLink(mom.page, 'child'), 'Сын');
  return { mom, son };
}

export async function setCurrentWeek(page: Page) {
  await tab(page, 'Меню');
  await page.getByRole('button', { name: 'Выбрать неделю' }).click();
  // The button stays disabled until the template's 28 meals have downloaded.
  const apply = page.getByRole('dialog').getByRole('button', { name: /^Поставить «/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByText(/· утверждена$/)).toBeVisible();
}

export const listHead = (page: Page) => page.getByText(/^Отмечено \d+ из \d+$/);

export async function listSize(page: Page): Promise<number> {
  await expect(listHead(page)).toHaveText(/из [1-9]\d*$/);
  return Number((await listHead(page).textContent())!.match(/из (\d+)/)![1]);
}
