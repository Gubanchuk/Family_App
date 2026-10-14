/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { familyOfTwo } from './family.ts';

// A real JPEG drawn by the browser itself, so the phone-side decoding is exercised for real.
async function jpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => new Promise<string>((done) => {
    const c = Object.assign(document.createElement('canvas'), { width: 600, height: 800 });
    const g = c.getContext('2d')!;
    g.fillStyle = '#C92A62';
    g.fillRect(0, 0, 600, 800);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => done(String(r.result).split(',')[1]); r.readAsDataURL(b!); }, 'image/jpeg', 0.9);
  }));
  return Buffer.from(b64, 'base64');
}

test('mom posts a photo story with a caption, the son opens it and reacts, mom sees who watched', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await mom.page.getByRole('button', { name: 'Добавить сторис' }).click();
  await mom.page.getByLabel('Файл для сторис').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await jpeg(mom.page) });
  await mom.page.getByRole('button', { name: 'Надпись' }).click();
  await mom.page.getByRole('textbox', { name: 'Текст надписи' }).fill('Привет из кухни');
  await mom.page.getByRole('button', { name: 'Готово' }).click();
  await mom.page.getByRole('button', { name: 'Наклейка' }).click();
  await mom.page.getByRole('button', { name: '🎉' }).click();
  await mom.page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(mom.page.getByText('Сторис выложена')).toBeVisible();

  await son.page.reload();
  await son.page.getByRole('button', { name: 'Мама, новая сторис' }).click();
  await expect(son.page.getByText('Привет из кухни')).toBeVisible();
  await son.page.getByRole('button', { name: 'Реакция ❤️' }).click();
  await son.page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(son.page.getByRole('button', { name: 'Мама, сторис' })).toBeVisible();

  await mom.page.reload();
  await mom.page.getByRole('button', { name: 'Ваши сторис' }).click();
  await mom.page.getByRole('button', { name: 'Посмотрели: 1' }).click();
  await expect(mom.page.getByRole('dialog', { name: 'Кто посмотрел' })).toContainText('Сын');
  await expect(mom.page.getByLabel('реакция ❤️')).toBeVisible();
  await mom.close();
  await son.close();
});

test('a video story is shrunk on the phone and plays for the family', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  // A two-second clip recorded from a canvas in the page itself, handed to the picker as a file.
  await mom.page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
    const g = c.getContext('2d')!;
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.start();
    for (let i = 0; i < 60; i += 1) { g.fillStyle = `hsl(${i * 6} 80% 50%)`; g.fillRect(0, 0, 640, 360); await new Promise((r) => setTimeout(r, 33)); }
    rec.stop();
    await new Promise((r) => { rec.onstop = r; });
    const file = new File(parts, 'clip.webm', { type: 'video/webm' });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Файл для сторис"]')!;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await mom.page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(mom.page.getByText(/Сторис выложена/)).toBeVisible({ timeout: 60_000 });
  await son.page.reload();
  await son.page.getByRole('button', { name: 'Мама, новая сторис' }).click();
  await expect.poll(() => son.page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await mom.close();
  await son.close();
});

test('a new circle photo reaches the other phone', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await mom.page.getByRole('link', { name: 'Настройки и профиль' }).click();
  await mom.page.getByRole('button', { name: 'Изменить' }).click();
  await mom.page.getByLabel('Выбрать фото').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: await jpeg(mom.page) });
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(mom.page.getByText('Профиль сохранён')).toBeVisible();
  await son.page.reload();
  await expect(son.page.getByRole('group', { name: 'Семья' }).locator('img').first()).toBeVisible();
  await mom.close();
  await son.close();
});
