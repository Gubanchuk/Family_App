import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import Sheet from './Sheet';
import MealRow from './MealRow';

function Host({ keep = false }: { keep?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Открыть</button>
      {open ? <Sheet title="Ужин во вторник" onClose={() => setOpen(false)} keepOnBackdrop={keep}><p>текст</p></Sheet> : null}
    </>
  );
}

describe('Sheet', () => {
  it('moves focus into the sheet and back to where it was opened', async () => {
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Ужин во вторник' })).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
  });
  it('closes on a tap beside it, unless something typed in it would be lost', async () => {
    const { unmount } = render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await userEvent.click(document.querySelector('.sheet-backdrop')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    render(<Host keep />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await userEvent.click(document.querySelector('.sheet-backdrop')!);
    expect(screen.getByRole('dialog', { name: 'Ужин во вторник' })).toBeInTheDocument();
  });
  it('has one close button for screen readers', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getAllByRole('button', { name: /Закрыть/ })).toHaveLength(1);
  });
});

describe('MealRow', () => {
  it('reads out what goes with the dish and the note for Dima, and keeps replacing on its own button', () => {
    render(<MealRow name="Борщ" label="Обед" time="13:00" extra={['кастрюля на 3 дня, 2-й день']} note="отложить до зажарки" onOpen={() => {}} onReplace={() => {}} />);
    expect(screen.getByRole('button', { name: 'Обед: Борщ, кастрюля на 3 дня, 2-й день. Диме: отложить до зажарки.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Заменить обед' })).toHaveTextContent('Заменить');
  });
});
