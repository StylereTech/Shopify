import { useState, useEffect, type ReactNode } from 'react';
import { merchantApi, type Merchant } from '../api/merchantApi';
import { MerchantAuthContext } from './merchantAuthState';

export function MerchantAuthProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('merchant_token'));
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('merchant_token')));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    merchantApi
      .me()
      .then((value) => { if (!cancelled) setMerchant(value); })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem('merchant_token');
          setToken(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
