import { createContext, useContext } from 'react';
import type { Merchant } from '../api/merchantApi';

export interface AuthContextType {
  merchant: Merchant | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

export const MerchantAuthContext = createContext<AuthContextType | null>(null);

export function useMerchantAuth() {
  const ctx = useContext(MerchantAuthContext);
  if (!ctx) throw new Error('useMerchantAuth must be used within MerchantAuthProvider');
  return ctx;
}
