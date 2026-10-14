import { createContext, useContext } from 'react';
import type { Ring } from './order';

export type StoriesCtx = { available: boolean; ringOf: (memberId: string) => Ring; openViewer: (memberId: string) => void; compose: () => void };

// Without the provider (tests, screens before sign-in) stories are simply absent.
export const StoriesContext = createContext<StoriesCtx>({ available: false, ringOf: () => 'none', openViewer: () => {}, compose: () => {} });
export const useStories = () => useContext(StoriesContext);
