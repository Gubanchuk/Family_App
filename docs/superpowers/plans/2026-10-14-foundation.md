# Каркас «Семейного помощника» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать каркас приложения. В нём:
- страница проверки доступа для телефонов семьи;
- вход через Google или почту с паролем;
- семья с ролями и приглашениями;
- настройки с темой «День / Ночь»;
- база рецептов, недель и цен в Supabase;
- установка на экран «Домой».

**Architecture:**
- PWA на React + Vite + TypeScript лежит в `app/`.
- Supabase (Postgres, Auth, Realtime) хранит семью и начальную базу.
- Доступ к данным защищён Row Level Security.
- Схема живёт в `supabase/migrations/`. Её проверяют тесты на PGlite — это Postgres в Node, без Docker.
- Хостинг — Vercel.

Это первый из трёх планов. Второй — Меню и работа без интернета (Dexie + синхронизация). Третий — Покупки, Главная и пуши. Их пишем после этого плана: детали зависят от итогов проверки доступа.

**Tech Stack:**
- Node 24, npm 11;
- Vite 8, React 19, TypeScript;
- react-router-dom 7, @supabase/supabase-js 2;
- vite-plugin-pwa 2, @fontsource/onest 5;
- Vitest 5, jsdom, @testing-library/react 16, @electric-sql/pglite 0.5;
- Supabase CLI 2 через `npx`, Vercel CLI 53.

**Spec:** `docs/superpowers/specs/2026-10-13-family-app-design.md`. Внешний вид — `DESIGN.md` и `mockups/` (версия «Ягода»). Продукт — `PRODUCT.md`.

## Global Constraints

- **Язык.** Интерфейс только на русском. Комментарии в коде — короткие, на английском.
- **Коммиты.** Только по просьбе владельца. Шаг «Commit» в задачах выполнять, если владелец разрешил коммиты для этой работы. Иначе просто перечислить изменённые файлы. Ветка `main`, коммиты — Conventional Commits.
- **Секреты.**
  - Секретные ключи Supabase (`sb_secret_…`, `service_role`) не попадают в код, в чат и в файлы репозитория.
  - В приложении только `VITE_SUPABASE_URL` и publishable-ключ `sb_publishable_…`. Оба лежат в `app/.env.local`, файл не коммитится.
- **Supabase-проект:**
  - ref `pbipnjlsxkbhdyfebdeo`;
  - URL `https://pbipnjlsxkbhdyfebdeo.supabase.co`;
  - регион eu-west-1.
- **Шрифт.** Onest раздаётся со своего хостинга через `@fontsource/onest`. Google Fonts в приложении не используется: семья в РФ без VPN.
- **Дизайн.** Токены и компоненты берутся из `DESIGN.md` и `mockups/styles.css`, версия «Ягода»:
  - главный цвет `#C92A62`;
  - тема «День / Ночь / Как в телефоне»;
  - одна сплошная главная кнопка на экран;
  - подписи у кнопок.
- **Роли.**
  - `parent` и `child` назначает владелец семьи.
  - Ребёнок не видит деньги, обязательные платежи и пометки «берём в подарок». Таблицы денег появятся в третьем плане, правило закладывается уже здесь.
- **Семья.** Двое взрослых, сын 11 лет со своим входом, Дима 2 года без входа (профиль ведут родители). Доля порции: взрослые и сын — 1, Дима — 0,5.
- **Начальная база:**
  - рецепты — `content/recipes/*.json`, 229 штук;
  - продукты — `content/ingredients.json`;
  - цены — `content/prices.json`;
  - недели — `content/weeks.json`, 6 штук.
  - Это база с `household_id = null`, её видит любая семья.
- **Хостинг.** Vercel. Если на каком-то телефоне Vercel не открывается, та же сборка переезжает на Yandex Object Storage без изменений кода.

## Review Focus

1. **Мобильный интернет обрезает ответ Supabase до ~16 КБ.** Проверка должна написать «ответ обрезан» и показать полученный размер, а не «ок» и не бесконечную загрузку. Тест — в задаче 4.
2. **Ссылка-приглашение открыта второй раз, просрочена или открыта человеком, который уже в семье.** Понятная ошибка, второй профиль не создаётся. Тесты — в задаче 5.
3. **Ребёнок пытается сменить роль себе или другому, или прочитать чужую семью.** База отказывает, данные не меняются. Тесты — в задаче 5.
4. **Google недоступен или вход по почте с неверным паролем.** Человек видит русское сообщение, что случилось и что сделать; вход по почте остаётся доступен. Тест — в задаче 6.
5. **Тема «Как в телефоне», а телефон переключился в тёмный режим при открытом приложении.** Приложение переключается без перезагрузки. Тест — в задаче 2.

---

### Task 1: Репозиторий и пустое приложение

**Files:**
- Modify: `package.json` (корень — становится корнем workspace)
- Delete: `index.js` (заготовка IDE: `console.log('Happy developing ✨')`)
- Create: `app/` (через create-vite), `app/vite.config.ts`, `app/src/test/setup.ts`, `app/src/app/App.tsx`, `app/src/app/App.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm test` в корне запускает Vitest в `app/`. `npm run dev` поднимает Vite на `http://localhost:5173`. Компонент `App` (default export из `app/src/app/App.tsx`).

- [ ] **Step 1: Корень workspace**

Заменить содержимое `package.json` в корне:

```json
{
  "name": "family-app",
  "private": true,
  "workspaces": ["app"],
  "scripts": {
    "dev": "npm -w app run dev",
    "build": "npm -w app run build",
    "test": "npm -w app run test"
  }
}
```

Удалить `index.js`: `git rm --cached index.js && rm index.js` (файл уже добавлен в индекс).

- [ ] **Step 2: Создать приложение**

Run (в корне репозитория):

```bash
npm create vite@9 app -- --template react-ts
npm -w app install
npm -w app install @supabase/supabase-js@2 react-router-dom@7 @fontsource/onest@5
npm -w app install -D vitest@5 jsdom @testing-library/react@16 @testing-library/jest-dom @testing-library/user-event vite-plugin-pwa@2 @electric-sql/pglite@0.5
```

Expected: `app/package.json` содержит перечисленные пакеты, `npm -w app run build` завершается без ошибок.

- [ ] **Step 3: Настроить Vite и Vitest**

`app/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
});
```

`app/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

В `app/package.json` в `scripts` добавить `"test": "vitest run"` и `"test:watch": "vitest"`. В `app/tsconfig.app.json` в `compilerOptions.types` добавить `"vitest/globals"` не нужно — в тестах импортируем `describe/it/expect` из `vitest` явно.

- [ ] **Step 4: Написать падающий тест**

`app/src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('shows the product name', () => {
    render(<App />);
    expect(screen.getByText('Семейный помощник')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Запустить и увидеть падение**

Run: `npm test`
Expected: FAIL — `Cannot find module './App'` или отсутствует текст.

- [ ] **Step 6: Минимальная реализация**

`app/src/app/App.tsx`:

```tsx
export default function App() {
  return <main><h1>Семейный помощник</h1></main>;
}
```

В `app/src/main.tsx` заменить импорт стартового `App` на `import App from './app/App';`, удалить `app/src/App.tsx`, `app/src/App.css`, `app/src/index.css` и их импорты.

- [ ] **Step 7: Тест проходит**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 8: .gitignore**

Добавить в корневой `.gitignore`:

```
app/dist/
app/.env.local
supabase/.temp/
supabase/.branches/
.vercel/
```

- [ ] **Step 9: Commit** (только если владелец разрешил)

```bash
git add package.json .gitignore app
git rm --cached index.js
git commit -m "chore: scaffold the React app workspace"
```

---

### Task 2: Дизайн «Ягоды», оболочка и тема «День / Ночь»

**Files:**
- Create: `app/src/styles/tokens.css`, `app/src/styles/components.css`, `app/src/styles/base.css`
- Create: `app/src/lib/theme.ts`, `app/src/lib/theme.test.ts`
- Create: `app/src/features/shell/TabBar.tsx`, `app/src/features/shell/Header.tsx`, `app/src/features/shell/Icon.tsx`
- Create: `app/src/features/settings/ThemePicker.tsx`, `app/src/features/settings/ThemePicker.test.tsx`
- Modify: `app/src/app/App.tsx`, `app/src/main.tsx`, `app/index.html`

**Interfaces:**
- Consumes: `App` из задачи 1.
- Produces:
  - `type ThemeChoice = 'light' | 'dark' | 'auto'`;
  - `getThemeChoice(): ThemeChoice`;
  - `setThemeChoice(c: ThemeChoice): void` — пишет в `localStorage['fa.theme']` и выставляет `document.documentElement.dataset.theme`;
  - `isDarkNow(): boolean`;
  - `watchSystemTheme(onChange: () => void): () => void`;
  - компоненты `TabBar({ tabs: TabId[] })`, `Header({ title, subtitle?, action?, back? })`, `Icon({ name })`, `ThemePicker()`;
  - `type TabId = 'home' | 'menu' | 'shop'`.

- [ ] **Step 1: Токены**

`app/src/styles/tokens.css` — значения из `DESIGN.md` (frontmatter `colors`) и `mockups/styles.css` (блок `:root` и оба тёмных блока). Перенести целиком:
- блок `:root` из `mockups/styles.css`, без токенов `--chrome*` и `--tp-*`;
- блок `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`;
- блок `:root[data-theme="dark"] {…}`.

Потом добавить:

```css
:root { --k-bg: color-mix(in oklab, var(--k-bgtint) 7%, var(--k-base)); --k-hero: var(--k-primary); --k-hero-ink: var(--k-primary-ink); }
```

Проверка: в файле есть `--k-primary: #C92A62;`, `--k-tint-focal: 14%;`, `--k-scrim`, а в обоих тёмных блоках — `--k-tint-focal: 10%;` и `color-scheme: dark`.

- [ ] **Step 2: Базовые стили и компоненты**

`app/src/styles/base.css`:

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; background: var(--k-bg); color: var(--k-ink); font: 400 16px/1.45 "Onest", "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
button, input { font: inherit; color: inherit; }
::selection { background: color-mix(in oklab, var(--k-primary) 35%, transparent); }
:focus-visible { outline: 3px solid var(--k-primary); outline-offset: 2px; border-radius: 6px; }
.ic { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.screen { min-height: 100%; padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; }
```

`app/src/styles/components.css` — скопировать из `mockups/styles.css` разделы по комментариям-заголовкам, в этом порядке:
- `/* ---------- Tab bar ---------- */`
- `/* ---------- Toast ---------- */`
- `/* ---------- Shared pieces ---------- */`
- `/* Hero: … */`
- `/* Family row: … */`
- `/* Bento tiles: … */`
- `/* Time column, group labels and past rows. */`
- `/* Menu */`
- `/* Sub-screen header: … */`
- `/* Settings */`
- `/* Sheet: … */`
- `/* Signature: … */` вместе с блоком `prefers-reduced-motion`.

Разделы `Mock chrome`, `Board`, `Money` и правила `.layout`, `.device`, `.notes`, `.lockup`, `.n-*` не переносить. В правиле `.toast` заменить `position: absolute` на `position: fixed`.

`app/src/main.tsx` — импорты в начале:

```ts
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/onest/800.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
```

В `app/index.html`:
- `<html lang="ru">`;
- `<title>Семейный помощник</title>`;
- `<meta name="theme-color" content="#C92A62">`;
- viewport с `viewport-fit=cover`.

- [ ] **Step 3: Падающий тест темы**

`app/src/lib/theme.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getThemeChoice, isDarkNow, setThemeChoice, watchSystemTheme } from './theme';

function mockSystemDark(dark: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: dark,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return { set(v: boolean) { mql.matches = v; listeners.forEach((cb) => cb()); } };
}

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to following the phone', () => {
    mockSystemDark(false);
    expect(getThemeChoice()).toBe('auto');
  });

  it('stores an explicit choice and marks the root', () => {
    mockSystemDark(false);
    setThemeChoice('dark');
    expect(localStorage.getItem('fa.theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(isDarkNow()).toBe(true);
  });

  it('auto removes the mark and follows the phone', () => {
    const sys = mockSystemDark(true);
    setThemeChoice('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(isDarkNow()).toBe(true);
    const onChange = vi.fn();
    watchSystemTheme(onChange);
    sys.set(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(isDarkNow()).toBe(false);
  });

  it('survives storage that throws', () => {
    mockSystemDark(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getThemeChoice()).toBe('auto');
  });
});
```

- [ ] **Step 4: Убедиться, что падает**

Run: `npm test -- src/lib/theme.test.ts`
Expected: FAIL — модуль `./theme` не найден.

- [ ] **Step 5: Реализация**

`app/src/lib/theme.ts`:

```ts
export type ThemeChoice = 'light' | 'dark' | 'auto';
const KEY = 'fa.theme';

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(choice: ThemeChoice = getThemeChoice()): void {
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function setThemeChoice(choice: ThemeChoice): void {
  try { localStorage.setItem(KEY, choice); } catch { /* storage unavailable: keep for this session */ }
  applyTheme(choice);
}

export function isDarkNow(): boolean {
  const mark = document.documentElement.dataset.theme;
  return mark === 'dark' || (!mark && systemDark().matches);
}

export function watchSystemTheme(onChange: () => void): () => void {
  const mql = systemDark();
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
```

В `app/src/main.tsx` до рендера вызвать `applyTheme()`.

- [ ] **Step 6: Тест проходит**

Run: `npm test -- src/lib/theme.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Падающий тест выбора темы**

`app/src/features/settings/ThemePicker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemePicker from './ThemePicker';

describe('ThemePicker', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it('rings the theme in effect and switches to night', async () => {
    render(<ThemePicker />);
    expect(screen.getByRole('radio', { name: /День/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Тема как в телефоне' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: /Ночь/ }));
    expect(screen.getByRole('radio', { name: /Ночь/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Тема как в телефоне' })).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
```

- [ ] **Step 8: Реализация компонентов**

`app/src/features/shell/Icon.tsx` — SVG-символы из `mockups/index.html`:

```tsx
const PATHS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  menu: '<path d="M7 3v8"/><path d="M4.5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M7 11v10"/><path d="M17 21V3c-2.2 1.2-3.5 3.6-3.5 6.5V13H17"/>',
  cart: '<path d="M3 4h2.2l2.3 11h10.8l2.2-8H7"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4"/><path d="M19 12H9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
};

export default function Icon({ name, className = '' }: { name: keyof typeof PATHS | string; className?: string }) {
  return <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }} />;
}
```

`app/src/features/settings/ThemePicker.tsx`:

```tsx
import { useEffect, useState } from 'react';
import Icon from '../shell/Icon';
import { getThemeChoice, isDarkNow, setThemeChoice, watchSystemTheme, type ThemeChoice } from '../../lib/theme';

export default function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice());
  const [dark, setDark] = useState(isDarkNow());
  useEffect(() => watchSystemTheme(() => setDark(isDarkNow())), []);

  const pick = (c: ThemeChoice) => {
    setThemeChoice(c);
    setChoice(c);
    setDark(isDarkNow());
  };
  const auto = choice === 'auto';
  const card = (t: 'light' | 'dark', label: string, icon: string) => {
    const on = dark === (t === 'dark');
    return (
      <button type="button" role="radio" aria-checked={on} className={`tp ${auto ? 'auto' : ''}`} onClick={() => pick(t)}>
        <span className={`tp-mini ${t}`} aria-hidden="true"><i /><b /><b /></span>
        <span className="tp-l"><Icon name={icon} />{label}{auto && on ? <small>авто</small> : null}</span>
      </button>
    );
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Тема</h2></div>
      <div className="theme-pick" role="radiogroup" aria-label="Тема">
        {card('light', 'День', 'sun')}
        {card('dark', 'Ночь', 'moon')}
      </div>
      <div className="row">
        <span className="row-main"><b>Как в телефоне</b><small>сама переключится вечером, если так настроен телефон</small></span>
        <button type="button" className="switch" role="switch" aria-checked={auto} aria-label="Тема как в телефоне"
          onClick={() => pick(auto ? (dark ? 'dark' : 'light') : 'auto')}><i /></button>
      </div>
    </section>
  );
}
```

В `components.css` из раздела `/* Settings */` уже перенесены `.tp`, `.tp-mini`, `.switch`. Цвета мини-превью — токены `--tp-*` из `mockups/styles.css`. Добавить их в `tokens.css` в блок `:root` без тёмных переопределений.

`app/src/features/shell/TabBar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import Icon from './Icon';

export type TabId = 'home' | 'menu' | 'shop';
const TABS: Record<TabId, { to: string; label: string; icon: string }> = {
  home: { to: '/', label: 'Главная', icon: 'home' },
  menu: { to: '/menu', label: 'Меню', icon: 'menu' },
  shop: { to: '/shop', label: 'Покупки', icon: 'cart' },
};

export default function TabBar({ tabs }: { tabs: TabId[] }) {
  return (
    <nav className="tabbar" style={{ ['--tabs' as string]: tabs.length }} aria-label="Разделы">
      {tabs.map((t) => (
        // NavLink sets aria-current="page" on the active tab, which the .tab styles key on.
        <NavLink key={t} to={TABS[t].to} end className="tab">
          <span className="ic-wrap"><Icon name={TABS[t].icon} /></span><span>{TABS[t].label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
```

`app/src/features/shell/Header.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';

export default function Header({ title, subtitle, action, back }: { title: string; subtitle?: string; action?: ReactNode; back?: boolean }) {
  const nav = useNavigate();
  if (back) {
    return (
      <header className="k-head sub">
        <button type="button" className="round-btn" aria-label="Назад" onClick={() => nav(-1)}><Icon name="back" /></button>
        <div><h1>{title}</h1></div>
      </header>
    );
  }
  return (
    <header className="k-head">
      <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
      <div className="k-head-r">{action}</div>
    </header>
  );
}
```

`app/src/app/App.tsx` (маршруты появятся полностью в задаче 7; пока — оболочка):

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import TabBar from '../features/shell/TabBar';
import Header from '../features/shell/Header';
import ThemePicker from '../features/settings/ThemePicker';

export default function App() {
  return (
    <BrowserRouter>
      <div className="screen">
        <Routes>
          <Route path="/" element={<Header title="Семейный помощник" />} />
          <Route path="/settings" element={<><Header title="Настройки" back /><ThemePicker /></>} />
        </Routes>
      </div>
      <TabBar tabs={['home', 'menu', 'shop']} />
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: Тесты проходят**

Run: `npm test`
Expected: PASS — App (1), theme (4), ThemePicker (1).

- [ ] **Step 10: Глазами**

Run: `npm run dev`. Открыть `http://localhost:5173/settings` на ширине 390 px.
- Тема «День / Ночь» переключается.
- Шрифт Onest грузится с localhost: во вкладке Network нет запросов к `fonts.googleapis.com`.

- [ ] **Step 11: Commit** (только если владелец разрешил)

```bash
git add app
git commit -m "feat: add Berry design tokens, shell and day/night theme"
```

---

### Task 3: Supabase CLI, тестовый стенд базы и таблица для проверки доступа

**Files:**
- Create: `supabase/config.toml` (через `supabase init`)
- Create: `supabase/migrations/20261014000100_probe.sql`
- Create: `supabase/tests/bootstrap.sql`
- Create: `app/tests/db/harness.ts`, `app/tests/db/probe.test.ts`

**Interfaces:**
- Produces:
  - `createDb(): Promise<PGlite>` — новая база, к ней применены `bootstrap.sql` и все миграции по порядку имён;
  - `asUser(db, userId: string | null, sql: string, params?: unknown[]): Promise<Results>` — выполняет запрос под ролью `authenticated` с этим `auth.uid()`, а при `null` — под ролью `anon`;
  - таблица `public.probe_payload(id int primary key, body text)`, строка `id = 1`, 65 536 символов, читается ролью `anon`.

- [ ] **Step 1: Инициализация CLI** (владелец)

Владелец выполняет в чате Claude Code, каждую команду отдельно:
1. `! npx supabase@2 login` — откроется браузер, войти в Supabase.
2. `! npx supabase@2 init` — в корне репозитория. На вопросы про VS Code и IntelliJ ответить `N`.
3. `! npx supabase@2 link --project-ref pbipnjlsxkbhdyfebdeo` — CLI спросит пароль базы. Это Database password из Supabase → Project Settings → Database. Пароль владелец вводит сам, в чат его не пишет.

Expected: появился `supabase/config.toml`, команда `link` закончилась сообщением «Finished supabase link».

- [ ] **Step 2: Тестовый стенд**

`supabase/tests/bootstrap.sql` — минимальная копия того, что Supabase создаёт сам:

```sql
-- Test-only stand-in for the Supabase auth schema and roles. Never applied to the real project.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
```

`app/tests/db/harness.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(root, 'supabase/tests/bootstrap.sql'), 'utf8'));
  const dir = join(root, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return db;
}

export async function asUser(db: PGlite, userId: string | null, sql: string, params: unknown[] = []) {
  const role = userId ? 'authenticated' : 'anon';
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}

export async function addUser(db: PGlite, id: string, email = `${id.slice(0, 4)}@test.local`) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}
```

- [ ] **Step 3: Падающий тест**

`app/tests/db/probe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asUser, createDb } from './harness';

describe('probe_payload', () => {
  it('serves a payload larger than the 16 KB cut to anonymous visitors', async () => {
    const db = await createDb();
    const r = await asUser(db, null, 'select length(body) as n from public.probe_payload where id = 1');
    expect(Number((r.rows[0] as { n: number }).n)).toBeGreaterThanOrEqual(65536);
  });
});
```

Run: `npm test -- tests/db/probe.test.ts`
Expected: FAIL — `relation "public.probe_payload" does not exist`.

- [ ] **Step 4: Миграция**

`supabase/migrations/20261014000100_probe.sql`:

```sql
-- A 64 KB row: proves that responses larger than the ~16 KB cut seen on some Russian networks arrive whole.
create table public.probe_payload (id int primary key, body text not null);
insert into public.probe_payload (id, body) values (1, repeat('0123456789abcdef', 4096));
alter table public.probe_payload enable row level security;
create policy "probe is public" on public.probe_payload for select to anon, authenticated using (true);
grant select on public.probe_payload to anon, authenticated;
```

- [ ] **Step 5: Тест проходит**

Run: `npm test -- tests/db/probe.test.ts`
Expected: PASS.

- [ ] **Step 6: Отправить миграцию в проект**

Run: `npx supabase@2 db push`
Expected: «Applying migration 20261014000100_probe.sql… Finished supabase db push».

- [ ] **Step 7: Commit** (только если владелец разрешил)

```bash
git add supabase app/tests
git commit -m "feat: add Supabase project config, PGlite test stand and probe payload"
```

---

### Task 4: Страница проверки доступа и выкладка на Vercel

**Files:**
- Create: `app/src/lib/supabase.ts`, `app/.env.example`
- Create: `app/src/features/probe/checks.ts`, `app/src/features/probe/checks.test.ts`, `app/src/features/probe/ProbePage.tsx`
- Create: `app/vercel.json`
- Modify: `app/src/app/App.tsx` (маршрут `/probe` без входа)

**Interfaces:**
- Consumes: таблица `probe_payload` (задача 3).
- Produces:
  - `supabase` — клиент из `app/src/lib/supabase.ts`;
  - `type CheckResult = { id: string; title: string; ok: boolean; ms: number; detail: string }`;
  - `checkRest(url, key, fetchImpl?)`, `checkAuth(url, key, fetchImpl?)`, `checkGoogle(fetchImpl?)`, `checkRealtime(client)` — все возвращают `Promise<CheckResult>`;
  - `withTimeout<T>(p: Promise<T>, ms: number): Promise<T>`;
  - `formatReport(results: CheckResult[], env: { ua: string; net: string; host: string; at: string }): string`.

- [ ] **Step 1: Ключи** (владелец)

Создать `app/.env.example`:

```
VITE_SUPABASE_URL=https://pbipnjlsxkbhdyfebdeo.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
```

Владелец копирует его в `app/.env.local` и вставляет свой publishable-ключ из Supabase → Project Settings → API Keys. Ключ публичный, но файл всё равно не коммитится.

- [ ] **Step 2: Клиент Supabase**

`app/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

// Fallbacks keep tests and a misconfigured build from crashing on import; requests then fail visibly.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'http://localhost:54321';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'missing-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

- [ ] **Step 3: Падающие тесты проверок**

`app/src/features/probe/checks.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { checkAuth, checkGoogle, checkRest, formatReport, withTimeout } from './checks';

const URL = 'https://x.supabase.co';
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('probe checks', () => {
  it('passes when the whole 64 KB payload arrives', async () => {
    const f = vi.fn(() => json([{ body: 'a'.repeat(65536) }]));
    const r = await checkRest(URL, 'k', f);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledWith(`${URL}/rest/v1/probe_payload?select=body&id=eq.1`, expect.objectContaining({ headers: expect.objectContaining({ apikey: 'k' }) }));
  });

  it('reports a cut response with the size that arrived', async () => {
    const f = vi.fn(() => Promise.resolve(new Response('[{"body":"' + 'a'.repeat(16000), { status: 200 })));
    const r = await checkRest(URL, 'k', f);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/ответ обрезан/);
    expect(r.detail).toMatch(/16 0\d\d байт|16 \d{3} байт/);
  });

  it('reports a network failure in plain words', async () => {
    const r = await checkRest(URL, 'k', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('нет соединения');
  });

  it('reads the sign-in settings', async () => {
    const r = await checkAuth(URL, 'k', vi.fn(() => json({ external: { email: true, google: false } })));
    expect(r.ok).toBe(true);
    expect(r.detail).toBe('почта включена, Google выключен');
  });

  it('treats an opaque Google response as reachable', async () => {
    const r = await checkGoogle(vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))));
    expect(r.ok).toBe(true);
  });

  it('times out a hanging request', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 10000);
    vi.advanceTimersByTime(10001);
    await expect(p).rejects.toThrow('timeout');
    vi.useRealTimers();
  });

  it('formats a report to paste into the chat', () => {
    const text = formatReport([{ id: 'rest', title: 'База', ok: true, ms: 120, detail: '65 545 байт' }], { ua: 'UA', net: '4g', host: 'h', at: '2026-10-14 10:00' });
    expect(text).toContain('✓ База — 120 мс — 65 545 байт');
    expect(text).toContain('Сеть: 4g');
  });
});
```

Run: `npm test -- src/features/probe/checks.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Реализация проверок**

`app/src/features/probe/checks.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type CheckResult = { id: string; title: string; ok: boolean; ms: number; detail: string };
type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

const bytes = (n: number) => `${n.toLocaleString('ru-RU')} байт`;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const reason = (e: unknown) => (e instanceof Error && e.message === 'timeout' ? 'нет ответа 15 секунд' : 'нет соединения');

async function timed(id: string, title: string, run: () => Promise<{ ok: boolean; detail: string }>): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    const r = await withTimeout(run(), 15000);
    return { id, title, ms: Math.round(performance.now() - t0), ...r };
  } catch (e) {
    return { id, title, ok: false, ms: Math.round(performance.now() - t0), detail: reason(e) };
  }
}

export function checkRest(url: string, key: string, f: FetchImpl = fetch) {
  return timed('rest', 'База Supabase, ответ 64 КБ', async () => {
    const res = await f(`${url}/rest/v1/probe_payload?select=body&id=eq.1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `ошибка ${res.status}` };
    try {
      const body = (JSON.parse(text) as Array<{ body: string }>)[0]?.body ?? '';
      return body.length >= 65536 ? { ok: true, detail: bytes(text.length) } : { ok: false, detail: `ответ обрезан: пришло ${bytes(text.length)}` };
    } catch {
      return { ok: false, detail: `ответ обрезан: пришло ${bytes(text.length)}` };
    }
  });
}

export function checkAuth(url: string, key: string, f: FetchImpl = fetch) {
  return timed('auth', 'Вход по почте', async () => {
    const res = await f(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: 'no-store' });
    if (!res.ok) return { ok: false, detail: `ошибка ${res.status}` };
    const s = (await res.json()) as { external?: { email?: boolean; google?: boolean } };
    const email = !!s.external?.email;
    return { ok: email, detail: `почта ${email ? 'включена' : 'выключена'}, Google ${s.external?.google ? 'включён' : 'выключен'}` };
  });
}

export function checkGoogle(f: FetchImpl = fetch) {
  return timed('google', 'Вход Google', async () => {
    await f('https://accounts.google.com/gsi/client', { mode: 'no-cors', cache: 'no-store' });
    return { ok: true, detail: 'открывается' };
  });
}

export function checkRealtime(client: SupabaseClient) {
  return timed('realtime', 'Мгновенные обновления', () => new Promise((resolve) => {
    const ch = client.channel(`probe-${Math.random().toString(36).slice(2)}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { client.removeChannel(ch); resolve({ ok: true, detail: 'подключились' }); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { client.removeChannel(ch); resolve({ ok: false, detail: 'не подключились' }); }
    });
  }));
}

export function formatReport(results: CheckResult[], env: { ua: string; net: string; host: string; at: string }): string {
  return [
    `Проверка доступа, ${env.at}`,
    `Сайт: ${env.host}`,
    `Сеть: ${env.net}`,
    `Телефон: ${env.ua}`,
    ...results.map((r) => `${r.ok ? '✓' : '✗'} ${r.title} — ${r.ms} мс — ${r.detail}`),
  ].join('\n');
}
```

Run: `npm test -- src/features/probe/checks.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Страница**

`app/src/features/probe/ProbePage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '../../lib/supabase';
import { checkAuth, checkGoogle, checkRealtime, checkRest, formatReport, type CheckResult } from './checks';

export default function ProbePage() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    Promise.all([checkRest(SUPABASE_URL, SUPABASE_KEY), checkAuth(SUPABASE_URL, SUPABASE_KEY), checkGoogle(), checkRealtime(supabase)]).then(setResults);
  }, []);
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string } }).connection;
  const report = results ? formatReport(results, {
    ua: navigator.userAgent, net: conn ? `${conn.type ?? ''} ${conn.effectiveType ?? ''}`.trim() : 'неизвестно',
    host: location.host, at: new Date().toLocaleString('ru-RU'),
  }) : '';
  const copy = () => navigator.clipboard.writeText(report).then(() => setCopied('Скопировано. Вставьте в чат.'), () => setCopied('Не получилось скопировать: выделите текст ниже вручную.'));
  return (
    <main className="screen">
      <header className="k-head"><div><h1>Проверка доступа</h1><p>Откройте дважды: на мобильном интернете и на Wi-Fi.</p></div></header>
      <section className="card">
        {!results ? <p className="note">Проверяем, до 15 секунд…</p> : results.map((r) => (
          <div className="row" key={r.id}>
            <span className="row-main"><b>{r.ok ? '✓' : '✗'} {r.title}</b><small>{r.ms} мс · {r.detail}</small></span>
          </div>
        ))}
      </section>
      {results ? <div className="btns fill" style={{ margin: '0 16px 12px' }}><button type="button" className="btn" onClick={copy}>Скопировать результат</button></div> : null}
      {copied ? <p className="note" style={{ margin: '0 16px' }} role="status">{copied}</p> : null}
      {results ? <pre className="note" style={{ margin: '12px 16px', whiteSpace: 'pre-wrap' }}>{report}</pre> : null}
    </main>
  );
}
```

В `App.tsx` добавить `<Route path="/probe" element={<ProbePage />} />`. Маршрут доступен без входа: в задаче 7 он стоит вне проверки сессии.

- [ ] **Step 6: Vercel**

`app/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!assets/|.*\\..*).*)", "destination": "/index.html" }]
}
```

Владелец выполняет `! vercel login`. Дальше, из папки `app`:

```bash
vercel link --yes --project family-app
vercel env add VITE_SUPABASE_URL production      # https://pbipnjlsxkbhdyfebdeo.supabase.co
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
vercel --prod
```

Expected: адрес вида `https://family-app-<…>.vercel.app`, страница `/probe` открывается на компьютере и показывает четыре строки.

- [ ] **Step 7: Проверка на телефонах** (владелец, точка решения)

Каждый член семьи открывает `<адрес>/probe` дважды, на мобильном интернете и на Wi-Fi, нажимает «Скопировать результат» и присылает текст в чат. Решение по таблице из спеки (раздел «Шаг 0»):
- **Всё ✓** — продолжаем, Supabase Cloud и Vercel.
- **Не открывается сама страница** — переносим сборку `app/dist` на Yandex Object Storage, задачи плана не меняются.
- **✗ у «База Supabase» или «Мгновенные обновления»** — стоп. Выбираем прокси или свой бэкенд, план переписывается.

Google выключен до задачи 6, поэтому `auth` покажет «Google выключен». Это нормально.

- [ ] **Step 8: Commit** (только если владелец разрешил)

```bash
git add app
git commit -m "feat: add access probe page and Vercel config"
```

---

### Task 5: Семья, роли и приглашения в базе

**Files:**
- Create: `supabase/migrations/20261014000200_family.sql`
- Create: `app/tests/db/family.test.ts`

**Interfaces:**
- Consumes: `createDb`, `asUser`, `addUser` (задача 3).
- Produces (SQL):
  - таблицы `households`, `members`, `invites`, `member_settings`;
  - тип `member_role ('parent','child')`;
  - функции:
    - `my_household_ids() returns setof uuid`;
    - `is_parent(h uuid) returns boolean`;
    - `create_household(p_name text, p_my_name text, p_color text) returns uuid`;
    - `create_invite(p_household uuid, p_role member_role, p_member uuid default null) returns text` — код из 10 символов;
    - `accept_invite(p_code text, p_my_name text, p_color text) returns uuid` — id участника;
  - ошибки с кодами в тексте: `already_in_family`, `invite_not_found`, `invite_used`, `invite_expired`, `not_a_parent`.

- [ ] **Step 1: Падающие тесты**

`app/tests/db/family.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-00000000000a';
const SON = '00000000-0000-0000-0000-00000000000b';
const STRANGER = '00000000-0000-0000-0000-00000000000c';
let db: PGlite;
let household: string;

async function rows<T>(user: string | null, sql: string, params: unknown[] = []) {
  return (await asUser(db, user, sql, params)).rows as T[];
}

beforeEach(async () => {
  db = await createDb();
  for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
  household = (await rows<{ id: string }>(PAPA, "select public.create_household('Наша семья', 'Папа', '#2F6FDB') as id"))[0].id;
});

describe('family', () => {
  it('makes the creator the owner and a parent', async () => {
    const m = await rows<{ role: string; is_owner: boolean }>(PAPA, 'select role, is_owner from public.members where user_id = $1', [PAPA]);
    expect(m).toEqual([{ role: 'parent', is_owner: true }]);
  });

  it('refuses a second family for the same person', async () => {
    await expect(asUser(db, PAPA, "select public.create_household('Ещё', 'Папа', '#000000')")).rejects.toThrow(/already_in_family/);
  });

  it('lets a child join by invite exactly once', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    expect(code).toMatch(/^[A-Z2-9]{10}$/);
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code]);
    const me = await rows<{ role: string }>(SON, 'select role from public.members where user_id = $1', [SON]);
    expect(me).toEqual([{ role: 'child' }]);
    await expect(asUser(db, STRANGER, "select public.accept_invite($1, 'Кто-то', '#000000')", [code])).rejects.toThrow(/invite_used/);
  });

  it('rejects an expired invite', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    await db.query("update public.invites set expires_at = now() - interval '1 minute' where code = $1", [code]);
    await expect(asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code])).rejects.toThrow(/invite_expired/);
  });

  it('rejects an invite for someone already in a family', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'parent') as c", [household]))[0].c;
    await expect(asUser(db, PAPA, "select public.accept_invite($1, 'Папа', '#2F6FDB')", [code])).rejects.toThrow(/already_in_family/);
  });

  it('links an invite to an existing profile instead of creating a second one', async () => {
    const son = (await rows<{ id: string }>(PAPA, "insert into public.members (household_id, name, color, role) values ($1, 'Сын', '#1FA463', 'child') returning id", [household]))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child', $2) as c", [household, son]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code]);
    const all = await rows<{ id: string; user_id: string }>(PAPA, 'select id, user_id from public.members where name = $1', ['Сын']);
    expect(all).toEqual([{ id: son, user_id: SON }]);
  });

  it('keeps a family invisible to strangers', async () => {
    expect(await rows(STRANGER, 'select * from public.households')).toEqual([]);
    expect(await rows(STRANGER, 'select * from public.members')).toEqual([]);
  });

  it('does not let a child change roles', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code]);
    await asUser(db, SON, "update public.members set role = 'parent' where user_id = $1", [SON]);
    const me = await rows<{ role: string }>(PAPA, 'select role from public.members where user_id = $1', [SON]);
    expect(me).toEqual([{ role: 'child' }]);
    await expect(asUser(db, SON, "select public.create_invite($1, 'parent')", [household])).rejects.toThrow(/not_a_parent/);
  });

  it('lets a parent add a profile without sign-in for the toddler', async () => {
    await asUser(db, PAPA, "insert into public.members (household_id, name, color, role, portion) values ($1, 'Дима', '#F2A900', 'child', 0.5)", [household]);
    const dima = await rows<{ user_id: string | null; portion: string }>(PAPA, "select user_id, portion from public.members where name = 'Дима'");
    expect(dima).toEqual([{ user_id: null, portion: '0.50' }]);
  });

  it('lets each member change only their own settings', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    const sonId = (await rows<{ id: string }>(SON, "select public.accept_invite($1, 'Сын', '#1FA463') as id", [code]))[0].id;
    await asUser(db, SON, "update public.member_settings set theme = 'dark' where member_id = $1", [sonId]);
    const papaId = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA]))[0].id;
    await asUser(db, SON, "update public.member_settings set theme = 'dark' where member_id = $1", [papaId]);
    const themes = await rows<{ theme: string }>(PAPA, 'select theme from public.member_settings order by member_id = $1', [papaId]);
    expect(themes.map((t) => t.theme)).toEqual(['dark', 'auto']);
  });
});
```

Run: `npm test -- tests/db/family.test.ts`
Expected: FAIL — функции не существуют.

- [ ] **Step 2: Миграция**

`supabase/migrations/20261014000200_family.sql`:

```sql
create type public.member_role as enum ('parent', 'child');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(name) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  role public.member_role not null,
  is_owner boolean not null default false,
  portion numeric(3, 2) not null default 1 check (portion > 0 and portion <= 1.5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, user_id)
);
create unique index members_one_family_per_user on public.members (user_id) where user_id is not null and deleted_at is null;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  role public.member_role not null,
  member_id uuid references public.members (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.member_settings (
  member_id uuid primary key references public.members (id) on delete cascade,
  theme text not null default 'auto' check (theme in ('light', 'dark', 'auto')),
  meal_times jsonb not null default '["08:00","13:00","16:30","19:00"]',
  notify jsonb not null default '{"requests":true,"offers":true,"votes":true,"shop":false,"quiet":true}',
  updated_at timestamptz not null default now()
);

create function public.my_household_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid() and deleted_at is null
$$;

create function public.is_parent(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = h and user_id = auth.uid() and role = 'parent' and deleted_at is null)
$$;

create function public.add_member_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.member_settings (member_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger members_settings after insert on public.members for each row execute function public.add_member_settings();

create function public.create_household(p_name text, p_my_name text, p_color text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid() and deleted_at is null) then raise exception 'already_in_family'; end if;
  insert into public.households (name) values (p_name) returning id into h;
  insert into public.members (household_id, user_id, name, color, role, is_owner) values (h, auth.uid(), p_my_name, p_color, 'parent', true);
  return h;
end $$;

create function public.create_invite(p_household uuid, p_role public.member_role, p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_parent(p_household) then raise exception 'not_a_parent'; end if;
  -- 10 characters without 0/O/1/I so the code can be read aloud.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') into c from generate_series(1, 10);
  insert into public.invites (household_id, code, role, member_id) values (p_household, c, p_role, p_member);
  return c;
end $$;

create function public.accept_invite(p_code text, p_my_name text, p_color text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites; m uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into inv from public.invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'invite_not_found'; end if;
  if inv.used_at is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if exists (select 1 from public.members where user_id = auth.uid() and deleted_at is null) then raise exception 'already_in_family'; end if;
  if inv.member_id is not null then
    update public.members set user_id = auth.uid(), updated_at = now() where id = inv.member_id returning id into m;
  else
    insert into public.members (household_id, user_id, name, color, role) values (inv.household_id, auth.uid(), p_my_name, p_color, inv.role) returning id into m;
  end if;
  update public.invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return m;
end $$;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.member_settings enable row level security;

create policy "family sees its household" on public.households for select to authenticated using (id in (select public.my_household_ids()));
create policy "parents rename the household" on public.households for update to authenticated using (public.is_parent(id));

create policy "family sees its members" on public.members for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "parents add members" on public.members for insert to authenticated with check (public.is_parent(household_id));
create policy "parents edit members" on public.members for update to authenticated using (public.is_parent(household_id));
create policy "parents remove members" on public.members for delete to authenticated using (public.is_parent(household_id) and not is_owner);

create policy "parents see invites" on public.invites for select to authenticated using (public.is_parent(household_id));
create policy "parents cancel invites" on public.invites for delete to authenticated using (public.is_parent(household_id));

create policy "family sees settings" on public.member_settings for select to authenticated
  using (member_id in (select id from public.members where household_id in (select public.my_household_ids())));
create policy "own settings or a parent" on public.member_settings for update to authenticated
  using (member_id in (select id from public.members where user_id = auth.uid())
      or member_id in (select id from public.members where public.is_parent(household_id)));

grant select, update on public.households to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, delete on public.invites to authenticated;
grant select, update on public.member_settings to authenticated;
grant execute on function public.create_household(text, text, text), public.create_invite(uuid, public.member_role, uuid), public.accept_invite(text, text, text), public.my_household_ids(), public.is_parent(uuid) to authenticated;
```

- [ ] **Step 3: Тесты проходят**

Run: `npm test -- tests/db`
Expected: PASS — probe (1) и family (10).

- [ ] **Step 4: В проект**

Run: `npx supabase@2 db push`
Expected: миграция `20261014000200_family.sql` применена.

- [ ] **Step 5: Commit** (только если владелец разрешил)

```bash
git add supabase/migrations app/tests/db
git commit -m "feat: add households, members, invites and row level security"
```

---

### Task 6: Вход через Google и по почте с паролем

**Files:**
- Create: `app/src/features/auth/errors.ts`, `app/src/features/auth/errors.test.ts`
- Create: `app/src/features/auth/useSession.ts`, `app/src/features/auth/SignIn.tsx`, `app/src/features/auth/SignIn.test.tsx`

**Interfaces:**
- Consumes: `supabase` (задача 4).
- Produces:
  - `authErrorText(e: { message?: string; code?: string } | null): string`;
  - `useSession(): { session: Session | null; loading: boolean }`;
  - компонент `SignIn({ client? })` — `client` подменяется в тестах.

- [ ] **Step 1: Настройки Supabase** (владелец, по шагам)

1. **Supabase → Authentication → URL Configuration:**
   - Site URL = адрес Vercel из задачи 4;
   - Redirect URLs: добавить `http://localhost:5173/**` и `<адрес Vercel>/**`.
2. **Authentication → Sign In / Providers → Email:**
   - включено;
   - «Confirm email» выключить: семья входит по приглашению, письма из РФ могут теряться.
3. **Google Cloud Console** (console.cloud.google.com):
   - создать проект «Семейный помощник»;
   - APIs & Services → OAuth consent screen: тип External, имя приложения, ваша почта, сохранить;
   - Audience → Publish app: для доступа к имени и почте проверка Google не нужна;
   - Credentials → Create credentials → OAuth client ID: тип Web application;
   - Authorized redirect URI: `https://pbipnjlsxkbhdyfebdeo.supabase.co/auth/v1/callback`;
   - скопировать Client ID и Client secret.
4. **Supabase → Authentication → Sign In / Providers → Google:**
   - включить;
   - вставить Client ID и Client secret самому. В чат их не присылать.

Expected: страница `/probe` в строке «Вход по почте» пишет «почта включена, Google включён».

- [ ] **Step 2: Падающие тесты сообщений об ошибках**

`app/src/features/auth/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { authErrorText } from './errors';

describe('authErrorText', () => {
  it('explains a wrong password', () => {
    expect(authErrorText({ code: 'invalid_credentials' })).toBe('Неверная почта или пароль. Проверьте раскладку и попробуйте ещё раз.');
  });
  it('explains a taken email', () => {
    expect(authErrorText({ code: 'user_already_exists' })).toBe('С этой почтой уже есть вход. Нажмите «Войти».');
  });
  it('explains a short password', () => {
    expect(authErrorText({ code: 'weak_password' })).toBe('Пароль слишком простой: нужно хотя бы 8 символов.');
  });
  it('explains a blocked network', () => {
    expect(authErrorText({ message: 'Failed to fetch' })).toBe('Нет связи с сервером. Проверьте интернет или войдите позже.');
  });
  it('falls back to a plain message', () => {
    expect(authErrorText({ message: 'something odd' })).toBe('Не получилось войти. Попробуйте ещё раз.');
  });
});
```

Run: `npm test -- src/features/auth/errors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация**

`app/src/features/auth/errors.ts`:

```ts
const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Неверная почта или пароль. Проверьте раскладку и попробуйте ещё раз.',
  user_already_exists: 'С этой почтой уже есть вход. Нажмите «Войти».',
  email_exists: 'С этой почтой уже есть вход. Нажмите «Войти».',
  weak_password: 'Пароль слишком простой: нужно хотя бы 8 символов.',
  over_request_rate_limit: 'Слишком много попыток. Подождите минуту.',
};

export function authErrorText(e: { message?: string; code?: string } | null): string {
  if (!e) return '';
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  if (e.message && /fetch|network/i.test(e.message)) return 'Нет связи с сервером. Проверьте интернет или войдите позже.';
  return 'Не получилось войти. Попробуйте ещё раз.';
}
```

`app/src/features/auth/useSession.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, loading };
}
```

- [ ] **Step 4: Падающий тест экрана входа**

`app/src/features/auth/SignIn.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SignIn from './SignIn';

function fakeClient(result: { error: { code?: string; message?: string } | null }) {
  return {
    auth: {
      signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: result.error })),
      signUp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signInWithOAuth: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    },
  };
}

describe('SignIn', () => {
  it('shows a Russian message for a wrong password and keeps the form', async () => {
    const client = fakeClient({ error: { code: 'invalid_credentials' } });
    render(<SignIn client={client as never} />);
    await userEvent.type(screen.getByLabelText('Почта'), 'papa@example.com');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверная почта или пароль');
    expect(screen.getByLabelText('Почта')).toHaveValue('papa@example.com');
  });

  it('starts Google sign-in with a return to this site', async () => {
    const client = fakeClient({ error: null });
    render(<SignIn client={client as never} />);
    await userEvent.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${location.origin}/` } });
  });
});
```

Run: `npm test -- src/features/auth/SignIn.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Экран входа**

`app/src/features/auth/SignIn.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { authErrorText } from './errors';

type AuthClient = Pick<SupabaseClient, 'auth'>;

export default function SignIn({ client = supabase }: { client?: AuthClient }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = mode === 'in'
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password });
    setBusy(false);
    if (r.error) setError(authErrorText(r.error));
  };
  const google = async () => {
    const r = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/` } });
    if (r.error) setError(authErrorText(r.error));
  };

  return (
    <main className="screen">
      <header className="k-head"><div><h1>Семейный помощник</h1><p>Вход для своих</p></div></header>
      <section className="card">
        <button type="button" className="btn" style={{ width: '100%' }} onClick={google}>Войти через Google</button>
        <p className="note">Если Google не открывается, войдите по почте.</p>
      </section>
      <form className="card" onSubmit={submit}>
        <div className="card-h"><h2>{mode === 'in' ? 'Вход по почте' : 'Новый вход по почте'}</h2></div>
        <label className="field">Почта<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Пароль<input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="btns fill">
          <button type="submit" className="btn soft" disabled={busy}>{mode === 'in' ? 'Войти' : 'Создать вход'}</button>
        </div>
        <button type="button" className="more" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Первый раз? Создать вход по почте' : 'Уже есть вход? Войти'}
        </button>
      </form>
    </main>
  );
}
```

В `components.css` добавить:

```css
.field { display: grid; gap: 6px; margin: 10px 0; font: 600 14px var(--font); color: var(--k-ink-2); }
.field input { min-height: 48px; padding: 0 14px; border: 1px solid var(--k-rule); border-radius: 14px; background: var(--k-card); color: var(--k-ink); font: 400 16px var(--font); }
.field input:focus-visible { outline: 3px solid var(--k-primary); outline-offset: 1px; }
.form-error { margin: 6px 0; padding: 10px 12px; border-radius: 12px; background: color-mix(in oklab, var(--k-urgent) var(--k-tint), var(--k-card)); color: color-mix(in oklab, var(--k-urgent) 82%, var(--k-ink)); font-size: 14px; }
```

- [ ] **Step 6: Тесты проходят**

Run: `npm test -- src/features/auth`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit** (только если владелец разрешил)

```bash
git add app/src/features/auth app/src/styles/components.css
git commit -m "feat: add Google and email sign-in with Russian error messages"
```

---

### Task 7: Первый вход, семья и приглашения в приложении

**Files:**
- Create: `app/src/features/family/api.ts`, `app/src/features/family/invite.ts`, `app/src/features/family/invite.test.ts`
- Create: `app/src/features/family/useFamily.ts`, `app/src/features/family/Onboarding.tsx`, `app/src/features/family/AcceptInvite.tsx`
- Create: `app/src/app/gate.ts`, `app/src/app/gate.test.ts`
- Modify: `app/src/app/App.tsx`

**Interfaces:**
- Consumes: `create_household`, `create_invite`, `accept_invite` (задача 5), `useSession` (задача 6).
- Produces:
  - `type Member = { id: string; household_id: string; user_id: string | null; name: string; color: string; role: 'parent' | 'child'; is_owner: boolean; portion: number }`;
  - `useFamily(session): { me: Member | null; members: Member[]; loading: boolean; reload(): void }`;
  - `inviteUrl(origin: string, code: string): string`;
  - `readInviteCode(search: string): string | null`;
  - `familyErrorText(message: string): string`;
  - `gate(input: { path: string; loadingSession: boolean; session: boolean; loadingFamily: boolean; hasMember: boolean; inviteCode: string | null }): 'loading' | 'probe' | 'sign-in' | 'accept-invite' | 'onboarding' | 'app'`;
  - `MEMBER_COLORS = ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900']`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/family/invite.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { familyErrorText, inviteUrl, readInviteCode } from './invite';

describe('invite links', () => {
  it('builds a link a parent can send', () => {
    expect(inviteUrl('https://family.example', 'ABCD234XYZ')).toBe('https://family.example/join?code=ABCD234XYZ');
  });
  it('reads the code from the link, forgiving case and spaces', () => {
    expect(readInviteCode('?code=%20abcd234xyz%20')).toBe('ABCD234XYZ');
    expect(readInviteCode('?code=')).toBeNull();
    expect(readInviteCode('')).toBeNull();
  });
  it('explains database errors in Russian', () => {
    expect(familyErrorText('invite_used')).toBe('Это приглашение уже использовали. Попросите родителя прислать новое.');
    expect(familyErrorText('invite_expired')).toBe('Приглашение устарело: оно действует 7 дней. Попросите новое.');
    expect(familyErrorText('invite_not_found')).toBe('Такого приглашения нет. Проверьте ссылку.');
    expect(familyErrorText('already_in_family')).toBe('Вы уже в семье. Второй раз вступать не нужно.');
    expect(familyErrorText('not_a_parent')).toBe('Это могут сделать только родители.');
    expect(familyErrorText('boom')).toBe('Не получилось. Попробуйте ещё раз.');
  });
});
```

`app/src/app/gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gate } from './gate';

const base = { path: '/', loadingSession: false, session: true, loadingFamily: false, hasMember: true, inviteCode: null };

describe('gate', () => {
  it('lets the probe open without sign-in', () => expect(gate({ ...base, path: '/probe', session: false })).toBe('probe'));
  it('asks to sign in first', () => expect(gate({ ...base, session: false })).toBe('sign-in'));
  it('waits while the session loads', () => expect(gate({ ...base, loadingSession: true })).toBe('loading'));
  it('accepts an invite before creating a family', () => expect(gate({ ...base, hasMember: false, inviteCode: 'ABCD234XYZ' })).toBe('accept-invite'));
  it('offers to create a family to a new person', () => expect(gate({ ...base, hasMember: false })).toBe('onboarding'));
  it('opens the app for a member', () => expect(gate(base)).toBe('app'));
  it('keeps the invite for after sign-in', () => expect(gate({ ...base, session: false, inviteCode: 'ABCD234XYZ' })).toBe('sign-in'));
});
```

Run: `npm test -- src/features/family src/app/gate.test.ts`
Expected: FAIL.

- [ ] **Step 2: Реализация функций**

`app/src/features/family/invite.ts`:

```ts
export const inviteUrl = (origin: string, code: string) => `${origin}/join?code=${code}`;

export function readInviteCode(search: string): string | null {
  const code = new URLSearchParams(search).get('code')?.trim().toUpperCase();
  return code ? code : null;
}

const TEXT: Record<string, string> = {
  invite_used: 'Это приглашение уже использовали. Попросите родителя прислать новое.',
  invite_expired: 'Приглашение устарело: оно действует 7 дней. Попросите новое.',
  invite_not_found: 'Такого приглашения нет. Проверьте ссылку.',
  already_in_family: 'Вы уже в семье. Второй раз вступать не нужно.',
  not_a_parent: 'Это могут сделать только родители.',
};

export function familyErrorText(message: string): string {
  const key = Object.keys(TEXT).find((k) => message.includes(k));
  return key ? TEXT[key] : 'Не получилось. Попробуйте ещё раз.';
}
```

`app/src/app/gate.ts`:

```ts
export type GateInput = { path: string; loadingSession: boolean; session: boolean; loadingFamily: boolean; hasMember: boolean; inviteCode: string | null };
export type GateResult = 'loading' | 'probe' | 'sign-in' | 'accept-invite' | 'onboarding' | 'app';

export function gate(i: GateInput): GateResult {
  if (i.path === '/probe') return 'probe';
  if (i.loadingSession) return 'loading';
  if (!i.session) return 'sign-in';
  if (i.loadingFamily) return 'loading';
  if (!i.hasMember) return i.inviteCode ? 'accept-invite' : 'onboarding';
  return 'app';
}
```

Код приглашения переживает вход через Google: перед `signInWithOAuth` сохранить его в `sessionStorage['fa.invite']`, а `readInviteCode` вызывать для `location.search`, если пусто — брать из `sessionStorage` (в `App.tsx`, шаг 4).

- [ ] **Step 3: API семьи и экраны**

`app/src/features/family/api.ts`:

```ts
import { supabase } from '../../lib/supabase';
import type { Member } from './useFamily';

export const MEMBER_COLORS = ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'];

export async function createHousehold(name: string, myName: string, color: string) {
  const { data, error } = await supabase.rpc('create_household', { p_name: name, p_my_name: myName, p_color: color });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function createInvite(household: string, role: 'parent' | 'child', member?: string) {
  const { data, error } = await supabase.rpc('create_invite', { p_household: household, p_role: role, p_member: member ?? null });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function acceptInvite(code: string, myName: string, color: string) {
  const { data, error } = await supabase.rpc('accept_invite', { p_code: code, p_my_name: myName, p_color: color });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function addProfileWithoutSignIn(household: string, name: string, color: string, portion: number) {
  const { error } = await supabase.from('members').insert({ household_id: household, name, color, role: 'child', portion });
  if (error) throw new Error(error.message);
}

export async function setRole(member: Member, role: 'parent' | 'child') {
  const { error } = await supabase.from('members').update({ role, updated_at: new Date().toISOString() }).eq('id', member.id);
  if (error) throw new Error(error.message);
}
```

`app/src/features/family/useFamily.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type Member = { id: string; household_id: string; user_id: string | null; name: string; color: string; role: 'parent' | 'child'; is_owner: boolean; portion: number };

export function useFamily(session: Session | null) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!session) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('members').select('id, household_id, user_id, name, color, role, is_owner, portion').is('deleted_at', null).order('created_at');
    setMembers((data ?? []).map((m) => ({ ...m, portion: Number(m.portion) })) as Member[]);
    setLoading(false);
  }, [session]);
  useEffect(() => { load(); }, [load]);
  const me = members.find((m) => m.user_id === session?.user.id) ?? null;
  return { me, members, loading, reload: load };
}
```

`app/src/features/family/Onboarding.tsx` — экран «Создать семью»:
- поля «Как назвать семью» (по умолчанию «Наша семья») и «Как вас называть» (по умолчанию «Папа»);
- выбор цвета кружка — кружки `MEMBER_COLORS` с `aria-pressed`;
- кнопка «Создать семью» вызывает `createHousehold(...)`, затем `onDone()`;
- ошибка — `familyErrorText(e.message)` в элементе с `role="alert"`;
- ниже текст «Если вас пригласили, откройте ссылку из приглашения».

```tsx
import { useState } from 'react';
import { createHousehold, MEMBER_COLORS } from './api';
import { familyErrorText } from './invite';

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [family, setFamily] = useState('Наша семья');
  const [name, setName] = useState('Папа');
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [error, setError] = useState('');
  const create = async () => {
    try { await createHousehold(family.trim(), name.trim(), color); onDone(); } catch (e) { setError(familyErrorText((e as Error).message)); }
  };
  return (
    <main className="screen">
      <header className="k-head"><div><h1>Создать семью</h1><p>Остальных пригласите ссылкой из настроек</p></div></header>
      <section className="card">
        <label className="field">Как назвать семью<input value={family} onChange={(e) => setFamily(e.target.value)} maxLength={40} /></label>
        <label className="field">Как вас называть<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <p className="note">Цвет вашего кружка</p>
        <div className="btns" role="group" aria-label="Цвет">
          {MEMBER_COLORS.map((c) => <button key={c} type="button" className="av" style={{ ['--c' as string]: c }} aria-pressed={c === color} aria-label={`Цвет ${c}`} onClick={() => setColor(c)} />)}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="btns fill" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={create} disabled={!family.trim() || !name.trim()}>Создать семью</button></div>
        <p className="note">Если вас пригласили, откройте ссылку из приглашения.</p>
      </section>
    </main>
  );
}
```

`app/src/features/family/AcceptInvite.tsx` — то же, без названия семьи:
- заголовок «Вас пригласили в семью»;
- поле «Как вас называть»;
- выбор цвета;
- кнопка «Вступить» вызывает `acceptInvite(code, name, color)`, затем `sessionStorage.removeItem('fa.invite')` и `onDone()`;
- ошибка — через `familyErrorText`.

```tsx
import { useState } from 'react';
import { acceptInvite, MEMBER_COLORS } from './api';
import { familyErrorText } from './invite';

export default function AcceptInvite({ code, onDone }: { code: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(MEMBER_COLORS[2]);
  const [error, setError] = useState('');
  const join = async () => {
    try {
      await acceptInvite(code, name.trim(), color);
      try { sessionStorage.removeItem('fa.invite'); } catch { /* storage unavailable */ }
      onDone();
    } catch (e) { setError(familyErrorText((e as Error).message)); }
  };
  return (
    <main className="screen">
      <header className="k-head"><div><h1>Вас пригласили в семью</h1><p>Код {code}</p></div></header>
      <section className="card">
        <label className="field">Как вас называть<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Сын" /></label>
        <div className="btns" role="group" aria-label="Цвет">
          {MEMBER_COLORS.map((c) => <button key={c} type="button" className="av" style={{ ['--c' as string]: c }} aria-pressed={c === color} aria-label={`Цвет ${c}`} onClick={() => setColor(c)} />)}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="btns fill" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={join} disabled={!name.trim()}>Вступить</button></div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Связать в App**

`app/src/app/App.tsx`:

```tsx
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import TabBar from '../features/shell/TabBar';
import Header from '../features/shell/Header';
import ProbePage from '../features/probe/ProbePage';
import SignIn from '../features/auth/SignIn';
import { useSession } from '../features/auth/useSession';
import { useFamily } from '../features/family/useFamily';
import Onboarding from '../features/family/Onboarding';
import AcceptInvite from '../features/family/AcceptInvite';
import { readInviteCode } from '../features/family/invite';
import Settings from '../features/settings/Settings';
import { gate } from './gate';

function storedInvite(search: string): string | null {
  const fromUrl = readInviteCode(search);
  try {
    if (fromUrl) { sessionStorage.setItem('fa.invite', fromUrl); return fromUrl; }
    return sessionStorage.getItem('fa.invite');
  } catch { return fromUrl; }
}

function Shell() {
  const loc = useLocation();
  const { session, loading } = useSession();
  const fam = useFamily(session);
  const invite = storedInvite(loc.search);
  const g = gate({ path: loc.pathname, loadingSession: loading, session: !!session, loadingFamily: fam.loading, hasMember: !!fam.me, inviteCode: invite });
  if (g === 'probe') return <ProbePage />;
  if (g === 'loading') return <main className="screen"><p className="note" style={{ margin: 16 }}>Загружаем…</p></main>;
  if (g === 'sign-in') return <SignIn />;
  if (g === 'accept-invite') return <AcceptInvite code={invite!} onDone={fam.reload} />;
  if (g === 'onboarding') return <Onboarding onDone={fam.reload} />;
  return (
    <>
      <div className="screen">
        <Routes>
          <Route path="/" element={<Header title={`Привет, ${fam.me!.name}`} subtitle="Меню и покупки появятся в следующих частях" />} />
          <Route path="/menu" element={<Header title="Меню" subtitle="Скоро" />} />
          <Route path="/shop" element={<Header title="Покупки" subtitle="Скоро" />} />
          <Route path="/settings" element={<Settings me={fam.me!} members={fam.members} reload={fam.reload} />} />
          <Route path="/join" element={<Header title="Вы уже в семье" />} />
        </Routes>
      </div>
      <TabBar tabs={['home', 'menu', 'shop']} />
    </>
  );
}

export default function App() {
  return <BrowserRouter><Shell /></BrowserRouter>;
}
```

`app/src/app/App.test.tsx` — заменить тест задачи 1 (оболочка теперь требует входа):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../features/auth/useSession', () => ({ useSession: () => ({ session: null, loading: false }) }));
vi.mock('../features/family/useFamily', () => ({ useFamily: () => ({ me: null, members: [], loading: false, reload: vi.fn() }) }));

describe('App', () => {
  it('asks a signed-out person to sign in', async () => {
    const { default: App } = await import('./App');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Войти через Google' })).toBeInTheDocument();
  });
});
```

`Settings` появится в задаче 8. До неё временный `app/src/features/settings/Settings.tsx` экспортирует компонент, который рендерит `<Header title="Настройки" back /><ThemePicker />`.

В `SignIn.tsx` перед `signInWithOAuth` код приглашения уже сохранён в `sessionStorage` функцией `storedInvite`. Отдельно передавать его не нужно.

- [ ] **Step 5: Тесты проходят**

Run: `npm test`
Expected: PASS — все тесты, включая invite (3) и gate (7).

- [ ] **Step 6: Проверка вживую** (на локальной сборке с реальным Supabase)

`npm run dev`, затем:
1. Создать вход по почте → «Создать семью» → попасть на «Привет, Папа».
2. В другом браузере открыть ссылку `/join?code=…` из задачи 8. Если задача 8 ещё не готова, код можно получить SQL-запросом `select public.create_invite(...)` от имени владельца в Supabase SQL Editor. Создать вход и вступить.
3. Открыть ту же ссылку ещё раз под третьим входом — сообщение «Это приглашение уже использовали…».

- [ ] **Step 7: Commit** (только если владелец разрешил)

```bash
git add app/src
git commit -m "feat: add onboarding, invite links and the sign-in gate"
```

---

### Task 8: Настройки: профиль, тема, семья, вход

**Files:**
- Create (заменить временный): `app/src/features/settings/Settings.tsx`, `app/src/features/settings/Settings.test.tsx`
- Create: `app/src/features/settings/syncTheme.ts`, `app/src/features/settings/syncTheme.test.ts`

**Interfaces:**
- Consumes: `Member`, `createInvite`, `addProfileWithoutSignIn`, `setRole`, `inviteUrl` (задача 7), `ThemePicker`, `setThemeChoice` (задача 2).
- Produces:
  - `Settings({ me, members, reload })`;
  - `saveThemeChoice(memberId: string, choice: ThemeChoice, client?): Promise<void>` — пишет `member_settings.theme`;
  - `loadThemeChoice(memberId: string, client?): Promise<ThemeChoice | null>`.

- [ ] **Step 1: Падающие тесты**

`app/src/features/settings/syncTheme.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { loadThemeChoice, saveThemeChoice } from './syncTheme';

function client(theme: string | null) {
  const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: theme ? { theme } : null, error: null })) })) }));
  return { from: vi.fn(() => ({ update, select })), update, select };
}

describe('theme sync', () => {
  it('saves the choice for the member', async () => {
    const c = client(null);
    await saveThemeChoice('m1', 'dark', c as never);
    expect(c.from).toHaveBeenCalledWith('member_settings');
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });
  it('loads a stored choice and ignores junk', async () => {
    expect(await loadThemeChoice('m1', client('light') as never)).toBe('light');
    expect(await loadThemeChoice('m1', client('purple') as never)).toBeNull();
    expect(await loadThemeChoice('m1', client(null) as never)).toBeNull();
  });
});
```

`app/src/features/settings/Settings.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';
import type { Member } from '../family/useFamily';

vi.mock('./syncTheme', () => ({ saveThemeChoice: vi.fn(() => Promise.resolve()), loadThemeChoice: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));

const m = (o: Partial<Member>): Member => ({ id: 'x', household_id: 'h', user_id: null, name: 'X', color: '#2F6FDB', role: 'parent', is_owner: false, portion: 1, ...o });
const papa = m({ id: 'p', user_id: 'u1', name: 'Папа', is_owner: true });
const son = m({ id: 's', user_id: 'u2', name: 'Сын', role: 'child', color: '#1FA463' });
const dima = m({ id: 'd', name: 'Дима', role: 'child', color: '#F2A900', portion: 0.5 });

describe('Settings', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));

  it('shows the family with roles to a parent', () => {
    render(<MemoryRouter><Settings me={papa} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Семья' })).toBeInTheDocument();
    expect(screen.getByText('Ребёнок · без входа, ведут родители')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пригласить в семью/ })).toBeInTheDocument();
  });

  it('hides family management from a child', () => {
    render(<MemoryRouter><Settings me={son} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Семья' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Тема' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Выйти/ })).toBeInTheDocument();
  });
});
```

Run: `npm test -- src/features/settings`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`app/src/features/settings/syncTheme.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { ThemeChoice } from '../../lib/theme';

type Db = Pick<SupabaseClient, 'from'>;
const VALID = ['light', 'dark', 'auto'];

export async function saveThemeChoice(memberId: string, choice: ThemeChoice, db: Db = supabase) {
  await db.from('member_settings').update({ theme: choice, updated_at: new Date().toISOString() }).eq('member_id', memberId);
}

export async function loadThemeChoice(memberId: string, db: Db = supabase): Promise<ThemeChoice | null> {
  const { data } = await db.from('member_settings').select('theme').eq('member_id', memberId).maybeSingle();
  const t = (data as { theme?: string } | null)?.theme;
  return t && VALID.includes(t) ? (t as ThemeChoice) : null;
}
```

`ThemePicker` получает необязательный проп `onPick`. Тест задачи 2 не меняется. В `app/src/features/settings/ThemePicker.tsx` заменить сигнатуру и функцию `pick`:

```tsx
export default function ThemePicker({ onPick }: { onPick?: (c: ThemeChoice) => void } = {}) {
  // …
  const pick = (c: ThemeChoice) => {
    setThemeChoice(c);
    setChoice(c);
    setDark(isDarkNow());
    onPick?.(c);
  };
```

При открытии настроек тема с сервера применяется, только если на телефоне ещё нет своего выбора: `localStorage['fa.theme']` пуст. Это делает `useEffect` в `Settings` ниже.

`app/src/features/settings/Settings.tsx`:

```tsx
import { useEffect, useState } from 'react';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import ThemePicker from './ThemePicker';
import { loadThemeChoice, saveThemeChoice } from './syncTheme';
import { setThemeChoice } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { Member } from '../family/useFamily';
import { addProfileWithoutSignIn, createInvite, MEMBER_COLORS } from '../family/api';
import { familyErrorText, inviteUrl } from '../family/invite';

const roleText = (m: Member) => m.role === 'parent' ? `Родитель${m.is_owner ? ' · владелец семьи' : ''}` : m.user_id ? 'Ребёнок · свой вход' : 'Ребёнок · без входа, ведут родители';

export default function Settings({ me, members, reload }: { me: Member; members: Member[]; reload: () => void }) {
  const [msg, setMsg] = useState('');
  const parent = me.role === 'parent';
  useEffect(() => {
    let mine: string | null = null;
    try { mine = localStorage.getItem('fa.theme'); } catch { /* storage unavailable */ }
    if (!mine) loadThemeChoice(me.id).then((t) => { if (t) setThemeChoice(t); });
  }, [me.id]);

  const invite = async () => {
    try {
      const code = await createInvite(me.household_id, 'child');
      const url = inviteUrl(location.origin, code);
      await navigator.clipboard.writeText(url).then(() => setMsg(`Ссылка скопирована: ${url}. Отправьте её в мессенджере, она действует 7 дней.`), () => setMsg(`Ссылка: ${url}. Скопируйте и отправьте, она действует 7 дней.`));
    } catch (e) { setMsg(familyErrorText((e as Error).message)); }
  };
  const addToddler = async () => {
    try { await addProfileWithoutSignIn(me.household_id, 'Дима', MEMBER_COLORS[3], 0.5); reload(); setMsg('Профиль без входа добавлен.'); }
    catch (e) { setMsg(familyErrorText((e as Error).message)); }
  };

  return (
    <>
      <Header title="Настройки" back />
      <section className="card profile">
        <span className="av lg" style={{ ['--c' as string]: me.color }} aria-hidden="true">{me.name.slice(0, 1)}</span>
        <span className="row-main"><b>{me.name}</b><small>{roleText(me)}</small></span>
      </section>
      <ThemePicker onPick={(c) => saveThemeChoice(me.id, c)} />
      {parent ? (
        <section className="card">
          <div className="card-h"><h2>Семья</h2></div>
          {members.map((m) => (
            <div className="row" key={m.id}>
              <span className="av sm" style={{ ['--c' as string]: m.color }} aria-hidden="true">{m.name.slice(0, 1)}</span>
              <span className="row-main"><b>{m.name}</b><small>{roleText(m)}</small></span>
            </div>
          ))}
          <button type="button" className="row set-row add-row" onClick={invite}><span className="row-main"><b>Пригласить в семью</b><small>ссылка для входа, 7 дней</small></span></button>
          {members.some((m) => !m.user_id && m.portion < 1) ? null : (
            <button type="button" className="row set-row add-row" onClick={addToddler}><span className="row-main"><b>Добавить малыша без входа</b><small>его рацион ведут родители</small></span></button>
          )}
        </section>
      ) : null}
      <section className="card">
        <div className="card-h"><h2>Вход</h2></div>
        <button type="button" className="btn danger" onClick={() => supabase.auth.signOut()}><Icon name="logout" />Выйти</button>
      </section>
      {msg ? <p className="note" role="status" style={{ margin: '0 16px 16px' }}>{msg}</p> : null}
    </>
  );
}
```

В шапку главного экрана добавить кнопку-аватар, через которую открываются настройки. В `App.tsx` заменить маршрут `/`:

```tsx
import { NavLink } from 'react-router-dom';
// …
<Route path="/" element={
  <Header title={`Привет, ${fam.me!.name}`} subtitle="Меню и покупки появятся в следующих частях"
    action={<NavLink to="/settings" className="av" style={{ ['--c' as string]: fam.me!.color }} aria-label="Настройки и профиль">{fam.me!.name.slice(0, 1)}</NavLink>} />
} />
```

- [ ] **Step 3: Тесты проходят**

Run: `npm test`
Expected: PASS — все тесты, в том числе Settings (2) и syncTheme (2).

- [ ] **Step 4: Commit** (только если владелец разрешил)

```bash
git add app/src
git commit -m "feat: add settings with profile, theme sync, family and invites"
```

---

### Task 9: Начальная база рецептов, недель и цен в Supabase

**Files:**
- Create: `supabase/migrations/20261014000300_content.sql`
- Create: `content/tools/build_seed.py`
- Create (генерируется): `supabase/migrations/20261014000400_seed_content.sql`
- Create: `app/tests/db/content.test.ts`

**Interfaces:**
- Consumes: `my_household_ids()` (задача 5); файлы `content/ingredients.json`, `content/prices.json`, `content/recipes/*.json`, `content/weeks.json`.
- Produces — таблицы:
  - `ingredients(item text pk, unit text, dept text, grp text, piece_weight numeric, piece_name text, pantry boolean)`;
  - `prices(item text pk → ingredients, price_per_unit numeric, source text, note text, collected date)`;
  - `recipes(id text pk, household_id uuid null, name, about, category, meals text[], time_active int, time_total int, servings int, keeps_days int, protein text, tags text[], season text[], collections text[], dima_level text, dima_note text, steps text[], source_url text, source_site text)`;
  - `recipe_ingredients(recipe_id → recipes, pos int, item → ingredients, qty numeric null, to_taste bool, note text, optional bool)`, pk `(recipe_id, pos)`;
  - `recipe_sides(recipe_id → recipes, side_id → recipes)`, pk пары;
  - `week_templates(id text pk, household_id uuid null, name text, season text[], note text)`;
  - `template_slots(template_id → week_templates, day smallint 0..6, meal text in ('breakfast','lunch','snack','dinner'), dish_id text null → recipes, side_id text null, salad_id text null, simple jsonb null)`, pk `(template_id, day, meal)`.
  - Скрипт `python -X utf8 -I content/tools/build_seed.py <root>` перезаписывает `20261014000400_seed_content.sql`.

- [ ] **Step 1: Падающий тест**

`app/tests/db/content.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const U = '00000000-0000-0000-0000-0000000000d1';
let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await addUser(db, U);
});

const one = async <T>(sql: string) => (await asUser(db, U, sql)).rows[0] as T;

describe('seed content', () => {
  it('has the whole recipe base readable by any signed-in person', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.recipes where household_id is null')).n)).toBe(229);
  });
  it('keeps every recipe ingredient in the vocabulary', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.recipe_ingredients ri left join public.ingredients i using (item) where i.item is null')).n)).toBe(0);
  });
  it('has six full week templates', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.week_templates')).n)).toBe(6);
    expect(Number((await one<{ n: number }>('select count(*) as n from public.template_slots')).n)).toBe(6 * 7 * 4);
  });
  it('points every template slot to a real dish or a simple snack', async () => {
    expect(Number((await one<{ n: number }>("select count(*) as n from public.template_slots where dish_id is null and simple is null")).n)).toBe(0);
  });
  it('has prices for most groceries', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.prices')).n)).toBeGreaterThanOrEqual(140);
  });
  it('hides the base from anonymous visitors', async () => {
    expect((await asUser(db, null, 'select id from public.recipes limit 1')).rows).toEqual([]);
  });
});
```

Run: `npm test -- tests/db/content.test.ts`
Expected: FAIL — нет таблиц.

- [ ] **Step 2: Схема контента**

`supabase/migrations/20261014000300_content.sql`:

```sql
create table public.ingredients (
  item text primary key, unit text not null check (unit in ('г', 'мл', 'шт')), dept text not null, grp text not null,
  piece_weight numeric, piece_name text, pantry boolean not null default false
);
create table public.prices (
  item text primary key references public.ingredients (item) on delete cascade,
  price_per_unit numeric not null check (price_per_unit > 0), source text not null, note text, collected date not null
);
create table public.recipes (
  id text primary key, household_id uuid references public.households (id) on delete cascade,
  name text not null, about text not null default '', category text not null, meals text[] not null,
  time_active int not null, time_total int not null, servings int not null check (servings > 0), keeps_days int not null default 1,
  protein text not null, tags text[] not null default '{}', season text[] not null default '{any}', collections text[] not null default '{}',
  dima_level text not null check (dima_level in ('ok', 'adapt', 'skip')), dima_note text not null default '',
  steps text[] not null, source_url text, source_site text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.recipe_ingredients (
  recipe_id text not null references public.recipes (id) on delete cascade, pos int not null,
  item text not null references public.ingredients (item), qty numeric, to_taste boolean not null default false,
  note text not null default '', optional boolean not null default false,
  primary key (recipe_id, pos)
);
create table public.recipe_sides (
  recipe_id text not null references public.recipes (id) on delete cascade,
  side_id text not null references public.recipes (id) on delete cascade,
  primary key (recipe_id, side_id)
);
create table public.week_templates (
  id text primary key, household_id uuid references public.households (id) on delete cascade,
  name text not null, season text[] not null default '{any}', note text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.template_slots (
  template_id text not null references public.week_templates (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  meal text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  dish_id text references public.recipes (id), side_id text references public.recipes (id), salad_id text references public.recipes (id),
  simple jsonb,
  primary key (template_id, day, meal),
  check (dish_id is not null or simple is not null)
);

alter table public.ingredients enable row level security;
alter table public.prices enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_sides enable row level security;
alter table public.week_templates enable row level security;
alter table public.template_slots enable row level security;

create policy "signed-in read the vocabulary" on public.ingredients for select to authenticated using (true);
create policy "signed-in read prices" on public.prices for select to authenticated using (true);
create policy "base or own recipes" on public.recipes for select to authenticated using (household_id is null or household_id in (select public.my_household_ids()));
create policy "family adds recipes" on public.recipes for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits own recipes" on public.recipes for update to authenticated using (household_id in (select public.my_household_ids()));
create policy "ingredients of visible recipes" on public.recipe_ingredients for select to authenticated using (recipe_id in (select id from public.recipes));
create policy "family writes own recipe ingredients" on public.recipe_ingredients for all to authenticated
  using (recipe_id in (select id from public.recipes where household_id in (select public.my_household_ids())))
  with check (recipe_id in (select id from public.recipes where household_id in (select public.my_household_ids())));
create policy "sides of visible recipes" on public.recipe_sides for select to authenticated using (recipe_id in (select id from public.recipes));
create policy "base or own templates" on public.week_templates for select to authenticated using (household_id is null or household_id in (select public.my_household_ids()));
create policy "family saves templates" on public.week_templates for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits own templates" on public.week_templates for update to authenticated using (household_id in (select public.my_household_ids()));
create policy "slots of visible templates" on public.template_slots for select to authenticated using (template_id in (select id from public.week_templates));
create policy "family writes own template slots" on public.template_slots for all to authenticated
  using (template_id in (select id from public.week_templates where household_id in (select public.my_household_ids())))
  with check (template_id in (select id from public.week_templates where household_id in (select public.my_household_ids())));

grant select on public.ingredients, public.prices, public.recipes, public.recipe_ingredients, public.recipe_sides, public.week_templates, public.template_slots to authenticated;
grant insert, update on public.recipes, public.week_templates to authenticated;
grant insert, update, delete on public.recipe_ingredients, public.template_slots to authenticated;
```

- [ ] **Step 3: Генератор данных**

`content/tools/build_seed.py`:

```python
"""Write supabase/migrations/20261014000400_seed_content.sql from content/*.json.

Usage: python -X utf8 -I content/tools/build_seed.py <project root>
"""
import io, json, os, sys

root = sys.argv[1]
c = lambda *p: os.path.join(root, 'content', *p)
OUT = os.path.join(root, 'supabase', 'migrations', '20261014000400_seed_content.sql')
MEALS = {'breakfast': 'breakfast', 'lunch': 'lunch', 'snack': 'snack', 'dinner': 'dinner'}


def q(v):
    """SQL literal for str, number, bool, None, list of str or dict (jsonb)."""
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        return 'array[' + ','.join(q(x) for x in v) + ']::text[]' if v else "'{}'::text[]"
    if isinstance(v, dict):
        return q(json.dumps(v, ensure_ascii=False)) + '::jsonb'
    return "'" + str(v).replace("'", "''") + "'"


def season(s):
    return ['any'] if s == 'any' or not s else list(s)


vocab = json.load(io.open(c('ingredients.json'), encoding='utf-8'))
prices = json.load(io.open(c('prices.json'), encoding='utf-8'))
weeks = json.load(io.open(c('weeks.json'), encoding='utf-8'))
recipes = []
for fn in sorted(os.listdir(c('recipes'))):
    if fn.endswith('.json'):
        recipes += json.load(io.open(c('recipes', fn), encoding='utf-8'))['recipes']

lines = ['-- Generated by content/tools/build_seed.py from content/. Do not edit by hand.', 'begin;']
for v in vocab:
    lines.append(f"insert into public.ingredients values ({q(v['item'])}, {q(v['unit'])}, {q(v['dept'])}, {q(v['group'])}, {q(v.get('pieceWeight'))}, {q(v.get('pieceName'))}, {q(bool(v.get('pantry')))}) on conflict (item) do update set unit = excluded.unit, dept = excluded.dept, grp = excluded.grp, piece_weight = excluded.piece_weight, piece_name = excluded.piece_name, pantry = excluded.pantry;")
for p in prices['prices']:
    lines.append(f"insert into public.prices values ({q(p['item'])}, {q(p['pricePerUnit'])}, {q(p['source'])}, {q(p.get('note'))}, {q(prices['collected'])}) on conflict (item) do update set price_per_unit = excluded.price_per_unit, source = excluded.source, note = excluded.note, collected = excluded.collected;")
for r in recipes:
    src = r.get('source') or {}
    lines.append('insert into public.recipes (id, name, about, category, meals, time_active, time_total, servings, keeps_days, protein, tags, season, collections, dima_level, dima_note, steps, source_url, source_site) values ('
                 + ', '.join([q(r['id']), q(r['name']), q(r.get('about', '')), q(r['category']), q(r['meals']), q(r['time']['active']), q(r['time']['total']),
                              q(r['servings']), q(r.get('keepsDays', 1)), q(r['protein']), q(r.get('tags', [])), q(season(r.get('season'))), q(r.get('collections', [])),
                              q(r['dima']['level']), q(r['dima'].get('note', '')), q(r['steps']), q(src.get('url')), q(src.get('site'))])
                 + ') on conflict (id) do nothing;')
    for i, ing in enumerate(r['ingredients']):
        lines.append(f"insert into public.recipe_ingredients values ({q(r['id'])}, {i}, {q(ing['item'])}, {q(ing.get('qty'))}, {q(bool(ing.get('toTaste')))}, {q(ing.get('note', ''))}, {q(bool(ing.get('optional')))}) on conflict do nothing;")
for r in recipes:
    for side in r.get('sides', []):
        lines.append(f"insert into public.recipe_sides values ({q(r['id'])}, {q(side)}) on conflict do nothing;")
for w in weeks:
    lines.append(f"insert into public.week_templates (id, name, season, note) values ({q(w['id'])}, {q(w['name'])}, {q(season(w.get('season')))}, {q(w.get('note', ''))}) on conflict (id) do nothing;")
    for day, d in enumerate(w['days']):
        lunch, dinner, snack = d.get('lunch') or {}, d.get('dinner') or {}, d.get('snack')
        slots = [
            ('breakfast', d.get('breakfast'), None, None, None),
            ('lunch', lunch.get('soup'), None, lunch.get('salad'), None),
            ('snack', snack if isinstance(snack, str) else None, None, None, snack if isinstance(snack, dict) else None),
            ('dinner', dinner.get('main'), dinner.get('side'), dinner.get('salad'), None),
        ]
        for meal, dish, side, salad, simple in slots:
            lines.append(f"insert into public.template_slots values ({q(w['id'])}, {day}, {q(meal)}, {q(dish)}, {q(side)}, {q(salad)}, {q(simple)}) on conflict do nothing;")
lines.append('commit;')
io.open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('recipes', len(recipes), 'weeks', len(weeks), 'lines', len(lines))
```

Run: `python -X utf8 -I content/tools/build_seed.py "E:/project/Family App"`
Expected: `recipes 229 weeks 6 lines …`, файл `supabase/migrations/20261014000400_seed_content.sql` создан.

- [ ] **Step 4: Тест проходит**

Run: `npm test -- tests/db/content.test.ts`
Expected: PASS, 6 tests. Если упал «has six full week templates»: у недели нет супа в какой-то день. Проверить `content/weeks.json` — пустой обед превращается в слот без блюда. Исправить данные недели, не тест.

- [ ] **Step 5: В проект**

Run: `npx supabase@2 db push`
Expected: применены `…000300_content.sql` и `…000400_seed_content.sql`.

Проверка в Supabase → Table Editor → `recipes`: 229 строк.

- [ ] **Step 6: Commit** (только если владелец разрешил)

```bash
git add supabase/migrations content/tools/build_seed.py app/tests/db/content.test.ts
git commit -m "feat: load the recipe, week and price base into Supabase"
```

---

### Task 10: Установка на телефон (PWA) и иконка «Дом»

**Files:**
- Create: `app/public/icon.svg`, `app/public/icon-192.png`, `app/public/icon-512.png`, `app/public/apple-touch-icon.png`
- Create: `app/scripts/build-icons.mjs`
- Create: `app/src/pwa.test.ts`
- Modify: `app/vite.config.ts`, `app/index.html`

**Interfaces:**
- Produces: `dist/manifest.webmanifest`, service worker `dist/sw.js` от vite-plugin-pwa. Приложение открывается без сети после первого визита: оболочка, шрифт и стили из кэша.

- [ ] **Step 1: Иконка**

`app/public/icon.svg` — знак «Дом» из `mockups/v-cards.js`, константа `house`. Цвета участников вписаны прямо в SVG, фон `#FFFFFF`, отступ 12%:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#FFFFFF"/>
  <g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(4 4) scale(0.875)">
    <path d="M14 30 32 13" stroke="#2F6FDB"/><path d="M32 13 50 30" stroke="#E0457B"/>
    <path d="M14 30v21h16" stroke="#1FA463"/><path d="M50 30v21H34" stroke="#F2A900"/>
  </g>
  <circle cx="32" cy="35.5" r="6" fill="none" stroke="#15161A" stroke-width="3.5"/>
</svg>
```

`app/scripts/build-icons.mjs` — PNG из SVG через `sharp`, установить `npm -w app install -D sharp`:

```js
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
}
console.log('icons ready');
```

Run: `node app/scripts/build-icons.mjs`
Expected: `icons ready`, три PNG в `app/public/`.

- [ ] **Step 2: Падающий тест манифеста**

`app/src/pwa.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { manifest } from '../pwa.config';

describe('pwa manifest', () => {
  it('names the app in Russian and uses the Berry colour', () => {
    expect(manifest.name).toBe('Семейный помощник');
    expect(manifest.short_name).toBe('Помощник');
    expect(manifest.lang).toBe('ru');
    expect(manifest.theme_color).toBe('#C92A62');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  });
});
```

Run: `npm test -- src/pwa.test.ts`
Expected: FAIL — нет `pwa.config`.

- [ ] **Step 3: Конфигурация PWA**

`app/pwa.config.ts`:

```ts
export const manifest = {
  name: 'Семейный помощник',
  short_name: 'Помощник',
  lang: 'ru',
  start_url: '/',
  display: 'standalone' as const,
  background_color: '#F6F0F2',
  theme_color: '#C92A62',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
```

`app/vite.config.ts` — добавить плагин:

```ts
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa.config';
// …
plugins: [react(), VitePWA({ registerType: 'autoUpdate', manifest, workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] } })],
```

В `app/index.html` добавить `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` и `<link rel="icon" href="/icon.svg" type="image/svg+xml">`.

- [ ] **Step 4: Тест и сборка**

Run: `npm test && npm run build`
Expected: тесты PASS. В `app/dist/` есть `manifest.webmanifest` и `sw.js`, в манифесте `"name":"Семейный помощник"`.

- [ ] **Step 5: Выложить и поставить на телефоны** (владелец)

Run: `cd app && vercel --prod`

На каждом телефоне:
- **iPhone:** Safari → адрес → «Поделиться» → «На экран Домой».
- **Android:** Chrome → меню → «Установить приложение».

Иконка «Дом» на экране. Приложение открывается без адресной строки. В режиме полёта показывает оболочку, а не ошибку браузера.

- [ ] **Step 6: Commit** (только если владелец разрешил)

```bash
git add app
git commit -m "feat: make the app installable with the house icon"
```

---

## Что дальше

После этого плана семья входит, видит свою семью и настройки, база рецептов лежит в Supabase. Следующие планы пишутся по итогам проверки доступа (задача 4, шаг 7):

- **План 2 — Меню и работа без интернета.**
  - Локальная база Dexie, очередь изменений и синхронизация.
  - Таблицы `weeks`, `week_slots`, `votes`, `dish_offers`.
  - Выбор недели, голосование и утверждение.
  - Замена блюда и целого дня из любого шаблона.
  - Сохранение недели как своего шаблона.
  - «Что покушать» и предложения блюд.
- **План 3 — Покупки, Главная и пуши.**
  - Сборка списка из меню: порции, кастрюли супа, кладовка, цены.
  - Ручные позиции и отметки в реальном времени.
  - «Иду в магазин», копирование списка.
  - Главная.
  - Web Push на три события.
