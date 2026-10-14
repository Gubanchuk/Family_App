import { useEffect, useState } from 'react';

// The current date for screens that may stay open overnight; a fixed date (tests) is returned as is.
export function useToday(fixed?: Date): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixed) return;
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [fixed]);
  return fixed ?? now;
}
