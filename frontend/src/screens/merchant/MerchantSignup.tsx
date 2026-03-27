import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_SHOPIFY_API_URL || 'https://api-production-653e.up.railway.app';

export const MerchantSignup: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultPlan = searchParams.get('plan') === 'growth' ? 'growth' : 'access';

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    store_name: '',
    city: '',
    state: '',
    plan: defaultPlan,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/merchant/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      // If Stripe checkout URL, redirect there
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      // Otherwise, go to login
      navigate('/merchant/login?registered=1');
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#a1a1aa',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: 500,
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
          Already have an account?{' '}
          <button onClick={() => navigate('/merchant/login')} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 14, padding: 0 }}>
            Sign in
          </button>
        </span>
      </header>

      {/* Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Create your account</h1>
          <p style={{ color: '#71717a', marginBottom: 32 }}>Start delivering in under an hour.</p>

          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#fca5a5', fontSize: 14 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input name="first_name" value={form.first_name} onChange={handleChange} style={inputStyle} placeholder="Ry" />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input name="last_name" value={form.last_name} onChange={handleChange} style={inputStyle} placeholder="Jordan" />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email *</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required style={inputStyle} placeholder="you@store.com" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Password *</label>
              <input name="password" type="password" value={form.password} onChange={handleChange} required style={inputStyle} placeholder="Minimum 8 characters" minLength={8} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Store Name *</label>
              <input name="store_name" value={form.store_name} onChange={handleChange} required style={inputStyle} placeholder="Boutique on Main" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>City</label>
                <input name="city" value={form.city} onChange={handleChange} style={inputStyle} placeholder="Dallas" />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input name="state" value={form.state} onChange={handleChange} style={inputStyle} placeholder="TX" maxLength={2} />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>Plan</label>
              <select name="plan" value={form.plan} onChange={handleChange} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="access">Stowry Access — $100/month</option>
                <option value="growth">Stowry Growth — $200/month</option>
              </select>
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
              {loading ? 'Creating account...' : 'Pay & Create Account'}
            </button>
          </form>

          <p style={{ color: '#52525b', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
            By creating an account you agree to our{' '}
            <a href="/shopify/terms" style={{ color: '#a1a1aa' }}>Terms of Service</a>{' '}
            and{' '}
            <a href="/shopify/privacy" style={{ color: '#a1a1aa' }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MerchantSignup;
