import { createContext, useContext } from 'react';
import type { MerchantAuthSnapshot } from './merchantAuthController';

export interface AuthContextType extends MerchantAuthSnapshot {
  login(email: string, password: string, signal?: AbortSignal): Promise<void>;
  logout(signal?: AbortSignal): Promise<void>;
  retry(): Promise<void>;
  isGenerationCurrent(key: string, token: string | null): boolean;
  isCurrent(key: string, owner: string | null, token: string | null): boolean;
}

export const MerchantAuthContext = createContext<AuthContextType | null>(null);

export function useMerchantAuth() {
  const ctx = useContext(MerchantAuthContext);
  if (!ctx) throw new Error('useMerchantAuth must be used within MerchantAuthProvider');
  return ctx;
}
