import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';

describe('Header', () => {
  // The real stylesheet: Vitest hands CSS imports over empty, so it is read from disk.
  let css = '';
  beforeAll(async () => {
    const { readFileSync } = await vi.importActual<{ readFileSync: (p: string, e: 'utf8') => string }>('node:fs');
    const { fileURLToPath } = await vi.importActual<{ fileURLToPath: (u: string) => string }>('node:url');
    css = readFileSync(fileURLToPath(import.meta.url.replace(/features\/shell\/[^/]+$/, 'styles/components.css')), 'utf8');
  });
  let style: HTMLStyleElement;
  beforeEach(() => { style = document.createElement('style'); style.textContent = css; document.head.append(style); });
  afterEach(() => style.remove());

  it('gives the title and the buttons one row and the subtitle a full row of its own', () => {
    render(<MemoryRouter><Header ask="money" title="Деньги" subtitle="Октябрь · видят только родители" action={<button type="button" className="head-pill">Расход</button>} /></MemoryRouter>);
    const head = screen.getByRole('banner');
    // Beside two pills the subtitle broke into a narrow column of two or three lines.
    expect([...head.children].map((c) => c.tagName)).toEqual(['H1', 'DIV', 'P']);
    expect(getComputedStyle(head).display).toBe('grid');
    expect(getComputedStyle(screen.getByText('Октябрь · видят только родители')).gridColumn).toMatch(/^1 \/ -1$/);
    expect(screen.getByRole('link', { name: 'Спросить помощника' })).toHaveAttribute('href', '/assistant?from=money');
    expect(screen.getByRole('button', { name: 'Расход' })).toBeInTheDocument();
  });

  it('keeps the plain stacked header without buttons, and the back button on nested screens', () => {
    const { unmount } = render(<MemoryRouter><Header title="Вы уже в семье" subtitle="Можно вернуться на главную" /></MemoryRouter>);
    const head = screen.getByRole('banner');
    expect(head).not.toHaveClass('split');
    expect(getComputedStyle(head).display).toBe('flex');
    expect(head.querySelector('div > h1 + p')).toHaveTextContent('Можно вернуться на главную');
    unmount();
    render(<MemoryRouter><Header title="Настройки" back /></MemoryRouter>);
    expect(screen.getByRole('banner')).toHaveClass('k-head', 'sub');
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
  });
});
