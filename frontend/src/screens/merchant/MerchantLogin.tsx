import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_SHOPIFY_API_URL || 'https://api-production-653e.up.railway.app';

export const MerchantLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justRegistered = searchParams.get('registered') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/merchant/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('merchant_token', data.token);
      localStorage.setItem('merchant_info', JSON.stringify(data.merchant));
      navigate('/merchant/dashboard');
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 8,
    padding: '12px 14px',
    color: '#fff',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fff', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '20px 32px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
          onClick={() => navigate('/merchant/pricing')}
        >
          <div style={{ width: 32, height: 32, background: '#f59e0b', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#09090b', fontSize: 16 }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Stowry</span>
        </div>
        <span style={{ color: '#52525b', fontSize: 14 }}>
          No account?{' '}
          <button onClick={() => navigate('/merchant/pricing')} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 14, padding: 0 }}>
            See plans
          </button>
        </span>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {justRegistered && (
            <div style={{ background: '#052e16', border: '1px solid #14532d', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#86efac', fontSize: 14 }}>
              Account created! Complete your payment to activate your plan, then sign in below.
            </div>
          )}

          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Welcome back</h1>
          <p style={{ color: '#71717a', marginBottom: 32 }}>Sign in to your merchant dashboard.</p>

          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#fca5a5', fontSize: 14 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
                placeholder="you@store.com"
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={inputStyle}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: '#f59e0b',
                color: '#09090b',
                border: 'none',
                padding: '15px 24px',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 16,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, color: '#52525b', fontSize: 14 }}>
            Don&apos;t have an account?{' '}
            <button
              onClick={() => navigate('/merchant/pricing')}
              style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 14, padding: 0 }}
            >
              Get started
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default MerchantLogin;
