import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import AssistantPage from './AssistantPage';
import { AssistantSession } from './loop';
import type { ApiReply, ChatBody } from './types';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Андрей', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Данил', role: 'child', is_owner: false };

function setup(api: (b: ChatBody) => Promise<ApiReply>, me = papa, from = 'shop') {
  const db = createLocalDb(`t-${Math.random()}`);
  const session = new AssistantSession({ db, me, members: [papa, son], api });
  render(<MemoryRouter initialEntries={[`/assistant?from=${from}`]}><AssistantPage me={me} members={[papa, son]} db={db} session={session} /></MemoryRouter>);
  return db;
}

describe('AssistantPage', () => {
  it('offers questions for the section it was opened from', async () => {
    setup(async () => ({ error: 'failed' }));
    expect(await screen.findByText(/Здравствуйте, Андрей/)).toBeInTheDocument();
    expect(screen.getByText('вы пришли из раздела «Покупки»')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Во сколько примерно выйдет поход/ })).toBeInTheDocument();
  });

  it('shows what it does in the app and lets it be undone', async () => {
    let n = 0;
    const db = setup(async () => {
      n += 1;
      if (n === 1) return { content: [{ type: 'text', text: 'Сейчас добавлю **молоко**.' }, { type: 'tool_use', id: 'tu1', name: 'add_to_shopping', input: { items: [{ name: 'Сок яблочный', amount: 1, unit: 'л' }] } }], stop_reason: 'tool_use' };
      return { content: [{ type: 'text', text: 'Готово.' }], stop_reason: 'end_turn' };
    });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Сообщение помощнику' }), 'Добавь сок');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    const card = await screen.findByRole('group', { name: /Готово: Добавляю в список: сок яблочный 1 л/ });
    expect(await screen.findByText('Готово.')).toBeInTheDocument();
    expect(screen.getByText('молоко', { selector: 'b' })).toBeInTheDocument();
    await waitFor(async () => expect((await db.shopping_items.toArray()).filter((i) => !i.deleted_at)).toHaveLength(1));
    await userEvent.click(within(card).getByRole('button', { name: 'Отменить' }));
    await waitFor(async () => expect((await db.shopping_items.toArray()).filter((i) => !i.deleted_at)).toHaveLength(0));
  });

  it('says plainly when there is no connection and offers to try again', async () => {
    setup(async () => ({ error: 'network' }));
    await userEvent.click(await screen.findByRole('button', { name: /Во сколько примерно выйдет поход/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Нет связи. Помощнику нужен интернет.');
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('gives a child home questions instead of money ones', async () => {
    setup(async () => ({ error: 'failed' }), son, 'money');
    expect(await screen.findByRole('button', { name: /Что приготовить на ужин/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /На что в этом месяце/ })).toBeNull();
  });
});
