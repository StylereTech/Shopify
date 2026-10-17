import { useEffect, useRef, useState } from 'react';
import type { CustomerSession } from '../api/customerSession';

export function useCustomerAction(session: CustomerSession) {
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); active.current = null; }; }, []);
  const begin = (extraCurrent = () => true) => {
    if (active.current || !mounted.current || !session.current() || !extraCurrent()) return null;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    return {
      signal: controller.signal,
      current: () => mounted.current && active.current === controller && !controller.signal.aborted && session.current() && extraCurrent(),
      finish: () => { if (active.current === controller) { active.current = null; if (mounted.current) setBusy(false); } },
    };
  };
  return { busy, begin };
}
