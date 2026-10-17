import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Sheet from '../features/menu/Sheet';
import { historySettled, pressBack } from '../test/pressBack';

const layer = () => (history.state as { layer?: number } | null)?.layer ?? 0;

// A sheet with a list, whose item opens a second sheet over it or hands over to one in its place.
function Stack() {
  const [list, setList] = useState(false);
  const [item, setItem] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setList(true)}>Список</button>
      {list ? (
        <Sheet title="Список" onClose={() => setList(false)}>
          <button type="button" onClick={() => setItem(true)}>Поверх</button>
          <button type="button" onClick={() => { setList(false); setItem(true); }}>Вместо</button>
        </Sheet>
      ) : null}
      {item ? <Sheet title="Пункт" onClose={() => setItem(false)}><p>пункт</p></Sheet> : null}
    </>
  );
}

describe('Back closes what is open on top', () => {
  it('closes the top sheet only, one per Back', async () => {
    await historySettled();
    render(<Stack />);
    await userEvent.click(screen.getByRole('button', { name: 'Список' }));
    await userEvent.click(screen.getByRole('button', { name: 'Поверх' }));
    await historySettled();
    expect(layer()).toBe(2);
    await pressBack();
    expect(screen.queryByRole('dialog', { name: 'Пункт' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Список' })).toBeInTheDocument();
    await pressBack();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(layer()).toBe(0);
  });

  it('closing by the cross takes only its own entry and leaves the sheet below open', async () => {
    await historySettled();
    const before = history.length;
    render(<Stack />);
    await userEvent.click(screen.getByRole('button', { name: 'Список' }));
    await userEvent.click(screen.getByRole('button', { name: 'Поверх' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Пункт' })).getByRole('button', { name: 'Закрыть' }));
    await historySettled();
    expect(screen.getByRole('dialog', { name: 'Список' })).toBeInTheDocument();
    expect(layer()).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await historySettled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(layer()).toBe(0);
    // Forward entries left by going back are dropped by the next push; nothing was added for good.
    expect(history.length).toBeLessThanOrEqual(before + 2);
  });

  it('a sheet that hands over to another passes its entry on', async () => {
    await historySettled();
    render(<Stack />);
    await userEvent.click(screen.getByRole('button', { name: 'Список' }));
    await historySettled();
    const length = history.length;
    await userEvent.click(screen.getByRole('button', { name: 'Вместо' }));
    await historySettled();
    expect(history.length).toBe(length);
    expect(layer()).toBe(1);
    await pressBack();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

let mounts = 0;
// A page whose sheet opens from its address once and tidies the address on close, like Menu's ?replace.
function Page() {
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  const [mount] = useState(() => ++mounts);
  const navigate = useNavigate();
  const [open, setOpen] = useState(params.has('pick'));
  return (
    <>
      <p>Страница {mount}{search}</p>
      <button type="button" onClick={() => setOpen(true)}>Открыть</button>
      {open ? (
        <Sheet title="Выбор" onClose={() => { setOpen(false); if (params.has('pick')) setParams({}, { replace: true }); }}>
          {/* Like Menu's «Предложить»: the address changes first, the sheet closes in the same batch. */}
          <button type="button" onClick={() => { setParams({ panel: 'ideas' }); setOpen(false); }}>Идеи</button>
          <button type="button" onClick={() => navigate('/y')}>Другая</button>
        </Sheet>
      ) : null}
    </>
  );
}
const app = (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<><p>Главная</p><Link to="/x?pick=1">С выбором</Link><Link to="/x">Страница</Link></>} />
      <Route path="/x" element={<Page />} />
      <Route path="/y" element={<p>Другая страница</p>} />
    </Routes>
  </BrowserRouter>
);

describe('Back next to react-router', () => {
  it('keeps the page and its state when Back closes a sheet', async () => {
    await historySettled();
    history.replaceState(null, '', '/');
    mounts = 0;
    render(app);
    await userEvent.click(screen.getByRole('link', { name: 'Страница' }));
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await pressBack();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Страница 1')).toBeInTheDocument();
    expect(location.pathname).toBe('/x');
    await pressBack();
    expect(screen.getByText('Главная')).toBeInTheDocument();
  });

  it('a sheet that replaces the address on close leaves no dead Back behind', async () => {
    await historySettled();
    history.replaceState(null, '', '/');
    mounts = 0;
    render(app);
    await userEvent.click(screen.getByRole('link', { name: 'С выбором' }));
    expect(screen.getByRole('dialog', { name: 'Выбор' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await historySettled();
    expect(screen.getByText('Страница 1')).toBeInTheDocument();
    expect(location.search).toBe('');
    await pressBack();
    expect(screen.getByText('Главная')).toBeInTheDocument();
  });

  it('a sheet closing right after its button changed the address leaves the new address alone', async () => {
    await historySettled();
    history.replaceState(null, '', '/');
    mounts = 0;
    render(app);
    await userEvent.click(screen.getByRole('link', { name: 'Страница' }));
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await historySettled();
    await userEvent.click(screen.getByRole('button', { name: 'Идеи' }));
    await historySettled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(location.search).toBe('?panel=ideas');
    expect(screen.getByText('Страница 1?panel=ideas')).toBeInTheDocument();
    // The sheet's entry stays under the new one: one Back shows the page as it was, nothing breaks.
    await pressBack();
    expect(screen.getByText('Страница 1')).toBeInTheDocument();
  });

  it('a sheet unmounted with its page by a navigation leaves the new page alone', async () => {
    await historySettled();
    history.replaceState(null, '', '/');
    mounts = 0;
    render(app);
    await userEvent.click(screen.getByRole('link', { name: 'Страница' }));
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await historySettled();
    await userEvent.click(screen.getByRole('button', { name: 'Другая' }));
    await historySettled();
    expect(location.pathname).toBe('/y');
    expect(screen.getByText('Другая страница')).toBeInTheDocument();
    await pressBack();
    expect(location.pathname).toBe('/x');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
