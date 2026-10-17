import { useMemo } from 'react';
import { createMerchantSession } from '../api/merchantSession';
import { useMerchantAuth } from './merchantAuthState';

export function useMerchantSession() {
  const { sessionKey, merchant, token, isCurrent, sessionSignal, loading } = useMerchantAuth();
  const owner = merchant?.id ?? null;
  return useMemo(() => ({ ...createMerchantSession({ key: sessionKey, owner, token, signal: sessionSignal,
    current: () => isCurrent(sessionKey, owner, token),
  }), loading }), [sessionKey, owner, token, isCurrent, sessionSignal, loading]);
}
