import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AppCard from './AppCard';

describe('AppCard', () => {
  it('shows the version and says when it is the latest', async () => {
    render(<AppCard check={vi.fn(async () => 'latest' as const)} />);
    expect(screen.getByText(/^версия /)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Проверить обновление' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Это последняя версия.');
  });

  it('reloads into a newer version once it has taken over', async () => {
    const reload = vi.fn();
    render(<AppCard reload={reload} check={vi.fn(async () => 'updated' as const)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Проверить обновление' }));
    expect(reload).toHaveBeenCalled();
  });

  it('drops the stored copy and reloads when an update is stuck', async () => {
    const reload = vi.fn();
    const reset = vi.fn(async () => {});
    render(<AppCard reload={reload} reset={reset} />);
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить и загрузить заново' }));
    expect(reset).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });
});
