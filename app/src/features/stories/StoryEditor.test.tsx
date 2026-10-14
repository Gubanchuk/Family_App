import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StoryEditor from './StoryEditor';

describe('StoryEditor', () => {
  it('adds a caption and a sticker and publishes them', async () => {
    const onPublish = vi.fn(async () => {});
    render(<StoryEditor kind="photo" src="blob:x" initial={[]} status="" publishLabel="Опубликовать" error="" onPublish={onPublish} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Надпись' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Текст надписи' }), 'Привет');
    await userEvent.click(screen.getByRole('button', { name: 'Цвет #C92A62' }));
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
    await userEvent.click(screen.getByRole('button', { name: 'Наклейка' }));
    await userEvent.click(screen.getByRole('button', { name: '🎉' }));
    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    expect(onPublish).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'text', text: 'Привет', color: '#C92A62' }),
      expect.objectContaining({ type: 'emoji', char: '🎉' }),
    ]);
  });

  it('asks before throwing away a story with captions', async () => {
    const onClose = vi.fn();
    render(<StoryEditor kind="photo" src="blob:x" initial={[{ id: 'a', type: 'emoji', char: '🔥', x: 0.5, y: 0.5, scale: 0.2, rotation: 0 }]} status="" publishLabel="Опубликовать" error="" onPublish={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Выйти без публикации' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows why a file cannot be posted', () => {
    render(<StoryEditor kind="photo" src={null} initial={[]} status="" publishLabel="Опубликовать" error="Этот файл не фото и не видео." onPublish={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Этот файл не фото и не видео.');
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled();
  });
});
