import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ToastProvider from './Toast';
import { useToast } from './toastContext';

function Shows({ text }: { text: string }) {
  const toast = useToast();
  useEffect(() => { toast({ text }); }, [toast, text]);
  return null;
}

const page = (sheet: boolean) => (
  <MemoryRouter>
    <ToastProvider>
      <Shows text="Добавлено в покупки" />
      {sheet ? <section className="sheet" role="dialog" aria-label="Товар"><p>Срочно</p></section> : null}
    </ToastProvider>
  </MemoryRouter>
);

describe('Toast', () => {
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

  it('sits above the tabs, and moves to the top of the screen while a sheet is open', () => {
    const { rerender } = render(page(false));
    const toast = screen.getByText('Добавлено в покупки').closest('.toast')!;
    expect(getComputedStyle(toast).bottom).toBe('84px');
    // A toast at the bottom would cover the sheet's rows and switches for seconds.
    rerender(page(true));
    expect(getComputedStyle(toast).bottom).toBe('auto');
    expect(toast.matches('body:has(.sheet) .toast-zone .toast')).toBe(true);
    rerender(page(false));
    expect(getComputedStyle(toast).bottom).toBe('84px');
  });
});
