import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ToastContext, type ToastMessage } from './toastContext';

const SHOW_MS = 4500;

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastMessage & { id: number }) | null>(null);
  const show = useCallback((t: ToastMessage) => setToast({ ...t, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const a = toast?.action;
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-zone" role="status" aria-live="polite">
        {toast ? (
          <div className="toast" key={toast.id}>
            <span>{toast.text}</span>
            {a?.to ? <Link className="toast-act" to={a.to} onClick={() => setToast(null)}>{a.label}</Link> : null}
            {a?.run ? <button type="button" className="toast-act" onClick={() => { a.run!(); setToast(null); }}>{a.label}</button> : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
