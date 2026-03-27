import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { merchantApi, type Merchant } from '../api/merchantApi';

interface AuthContextType {
  merchant: Merchant | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const MerchantAuthContext = createContext<AuthContextType | null>(null);

export function MerchantAuthProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('merchant_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      merchantApi
        .me()
        .then(setMerchant)
        .catch(() => {
          localStorage.removeItem('merchant_token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const { token: t, merchant: m } = await merchantApi.login(email, password);
    localStorage.setItem('merchant_token', t);
    setToken(t);
    setMerchant(m);
  };

  const logout = async () => {
    await merchantApi.logout().catch(() => {});
    localStorage.removeItem('merchant_token');
    localStorage.removeItem('merchant_info');
    setToken(null);
    setMerchant(null);
  };

  return (
    <MerchantAuthContext.Provider value={{ merchant, token, login, logout, loading }}>
      {children}
    </MerchantAuthContext.Provider>
  );
}

export function useMerchantAuth() {
  const ctx = useContext(MerchantAuthContext);
  if (!ctx) throw new Error('useMerchantAuth must be used within MerchantAuthProvider');
  return ctx;
}
