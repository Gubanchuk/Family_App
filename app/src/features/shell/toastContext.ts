import { createContext, useContext } from 'react';

export type ToastAction = { label: string; to?: string; run?: () => void };
export type ToastMessage = { text: string; action?: ToastAction };

export const ToastContext = createContext<(t: ToastMessage) => void>(() => {});
// What just got created or changed is confirmed at the bottom of the screen, above the tabs.
export const useToast = () => useContext(ToastContext);
