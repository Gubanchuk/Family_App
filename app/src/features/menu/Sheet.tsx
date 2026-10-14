import { useEffect, useRef, type ReactNode } from 'react';
import Icon from '../shell/Icon';

// keepOnBackdrop: a sheet with something typed in it closes only by its own button, not by a stray tap beside it.
export default function Sheet({ title, sub, onClose, children, actions, keepOnBackdrop = false }: { title: string; sub?: string; onClose: () => void; children: ReactNode; actions?: ReactNode; keepOnBackdrop?: boolean }) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    // Focus goes into the sheet and returns to the button that opened it.
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => { opener?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" aria-hidden="true" onClick={keepOnBackdrop ? undefined : onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={box} tabIndex={-1}>
        <div className="sheet-head"><h2>{title}</h2><button type="button" className="round-btn" aria-label="Закрыть" onClick={onClose}><Icon name="x" /></button></div>
        {sub ? <p className="sheet-sub">{sub}</p> : null}
        {children}
        {actions ? <div className="sheet-actions">{actions}</div> : null}
      </section>
    </>
  );
}
