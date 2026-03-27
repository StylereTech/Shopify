import React from 'react';
import { useNavigate } from 'react-router-dom';

const PLANS = [
  {
    id: 'access',
    name: 'Stowry Access',
    price: '$100',
    period: '/month',
    popular: false,
    features: [
      'Merchant dashboard',
      'Order tracking',
      'Order history',
      'Basic reporting',
      'Basic support',
      'Manual order creation',
    ],
  },
  {
    id: 'growth',
    name: 'Stowry Growth',
    price: '$200',
    period: '/month',
    popular: true,
    features: [
      'Everything in Access',
      'Priority dispatch',
      'Priority drivers',
      'Advanced analytics',
      'Multi-user staff accounts',
      'Premium support',
      'Preferred onboarding',
    ],
  },
];

export const MerchantPricing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ padding: '24px 32px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: '#f59e0b', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#09090b', fontSize: 18 }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 20 }}>Stowry</span>
        </div>
        <button
          onClick={() => navigate('/merchant/login')}
          style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#a1a1aa', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
        >
          Sign In
        </button>
      </header>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '72px 24px 48px' }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, margin: '0 0 16px', background: 'linear-gradient(135deg, #fff, #a1a1aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Simple, Transparent Pricing
        </h1>
        <p style={{ color: '#71717a', fontSize: 18, maxWidth: 480, margin: '0 auto' }}>
          Get your store delivering in under an hour. No hidden fees, cancel anytime.
        </p>
      </section>

      {/* Plans */}
      <section style={{ display: 'flex', gap: 24, justifyContent: 'center', padding: '0 24px 80px', flexWrap: 'wrap' }}>
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            style={{
              background: plan.popular ? '#18181b' : '#111113',
              border: plan.popular ? '2px solid #f59e0b' : '1px solid #27272a',
              borderRadius: 16,
              padding: 32,
              width: 320,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {plan.popular && (
              <div style={{
                position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                background: '#f59e0b', color: '#09090b', fontWeight: 700, fontSize: 12,
                padding: '4px 16px', borderRadius: 999, whiteSpace: 'nowrap'
              }}>
                MOST POPULAR
              </div>
            )}

            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>{plan.name}</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: plan.popular ? '#f59e0b' : '#fff' }}>{plan.price}</span>
              <span style={{ color: '#71717a', fontSize: 16 }}>{plan.period}</span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', flex: 1 }}>
              {plan.features.map((f) => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, color: '#d4d4d8', fontSize: 14 }}>
                  <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 16 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => navigate(`/merchant/signup?plan=${plan.id}`)}
              style={{
                background: plan.popular ? '#f59e0b' : 'transparent',
                color: plan.popular ? '#09090b' : '#f59e0b',
                border: plan.popular ? 'none' : '1px solid #f59e0b',
                padding: '14px 24px',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              Get Started
            </button>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #27272a', padding: '24px 32px', textAlign: 'center', color: '#52525b', fontSize: 13 }}>
        © 2026 Stowry. Last-mile delivery for retail. All rights reserved.
      </footer>
    </div>
  );
};

export default MerchantPricing;
