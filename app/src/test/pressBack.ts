import { act } from '@testing-library/react';
import { afterBackClose } from '../lib/backClose';

const settled = () => new Promise<void>((r) => afterBackClose(r));

// The phone's Back button: lets open layers get their history entries, goes back one entry and waits
// until whatever it closed has settled.
export async function pressBack() {
  await act(settled);
  await act(async () => {
    const popped = new Promise((r) => window.addEventListener('popstate', r, { once: true }));
    history.back();
    await popped;
    await settled();
  });
}

export const historySettled = () => act(settled);
