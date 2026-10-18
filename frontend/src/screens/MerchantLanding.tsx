import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { merchantInstallShop } from '../lib/merchantPageContracts';
import './merchant/merchant-pages.css';
import stylereLogoUrl from '../assets/stylere_logo.jpg';

// No token needed — begin-install is a public endpoint
const BASE_URL = '/shopify/begin-install';

function MerchantHandoffVisual() {
  const steps = [
    { title:'Store details', description:'Confirm your pickup address and the service available for your store.', icon:<><path d="M4 10h24l-3-6H7l-3 6Z" /><path d="M6 10v17h20V10M12 27V16h8v11M3 10v3a3 3 0 0 0 6 0 3 3 0 0 0 7 0 3 3 0 0 0 7 0 3 3 0 0 0 6 0v-3" /></> },
    { title:'Checkout review', description:'Review the delivery quote and confirm the payment required for the order.', icon:<><rect x="7" y="3" width="18" height="26" rx="3" /><path d="M12 9h8M12 14h8M12 20l3 3 6-7" /></> },
    { title:'Pickup handoff', description:'Prepare the order and its approved pickup details for the requested handoff.', icon:<><path d="m5 10 11-6 11 6-11 6-11-6Zm0 0v13l11 6 11-6V10M16 16v13M10 7l11 6" /></> },
    { title:'Order updates', description:'Follow saved request updates and the recorded delivery status for the order.', icon:<><rect x="7" y="3" width="18" height="26" rx="3" /><path d="M12 10h8M12 16h8M12 22h5" /><circle cx="23" cy="23" r="6" /><path d="m20 23 2 2 4-4" /></> },
  ];
  return <figure className="merchant-handoff" aria-labelledby="merchant-handoff-title">
    <figcaption>
      <span className="merchant-handoff__eyebrow">Store to door</span>
      <h2 id="merchant-handoff-title">A clear path from store setup to order updates</h2>
      <p>Each order depends on confirmed availability, payment, and pickup details.</p>
    </figcaption>
    <ol className="merchant-handoff__steps">
      {steps.map((step,index)=><li key={step.title}>
        <div className="merchant-handoff__step-head"><span className="merchant-handoff__number">{index+1}</span><svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{step.icon}</svg></div>
        <h3>{step.title}</h3><p>{step.description}</p>
      </li>)}
    </ol>
  </figure>;
}

export const MerchantLanding: React.FC = () => {
  const formRef = useRef<HTMLDivElement>(null);
  const [shopInput, setShopInput] = useState('');
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInstallUrl(null);

    let shop: string;
    try { shop = merchantInstallShop(shopInput); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Enter your Shopify store handle.'); return; }

    const url = `${BASE_URL}?shop=${encodeURIComponent(shop)}`;
    setInstallUrl(url);
  };

  return (
    <div className="merchant-landing font-sans bg-[#FAF9F7] text-[#1C1917] min-h-screen overflow-x-hidden">
      <nav className="merchant-entry-nav" aria-label="Merchant navigation"><Link to="/merchant/pricing">Merchant plans</Link><Link to="/merchant/login">Merchant sign in</Link></nav>
      <main>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section style={{ background: '#18212b' }}>
        {/* Text block — clean, no image behind it */}
        <div className="px-6 pt-12 pb-8 text-center">
          <div className="max-w-lg mx-auto flex flex-col items-center gap-5">
            <img src={stylereLogoUrl} alt="Style.re" className="h-10 w-auto rounded-xl object-contain" />

            <h1 className="text-[clamp(1.75rem,5vw,2.8rem)] font-bold text-white leading-[1.12] tracking-tight">
              Connect your store.<br />Plan the delivery handoff.
            </h1>
            <p className="text-[#A8A29E] text-[clamp(0.9rem,2vw,1.05rem)] leading-relaxed max-w-sm mx-auto">
              Explore store pickup and delivery with Style.re. Review your store’s eligibility, checkout flow, and current plan before launch.
            </p>

            <button
              onClick={scrollToForm}
              className="bg-[#b64017] text-white font-bold rounded-2xl px-8 py-4 text-[15px] tracking-wide active:scale-[0.98] transition-all duration-150 min-h-[52px]"
            >
              Get install link →
            </button>

            <p className="text-[#A8A29E] text-[14px]">
              Store eligibility · Current plans · Confirmed order updates
            </p>
          </div>
        </div>

        <MerchantHandoffVisual />
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[clamp(1.4rem,3.5vw,2rem)] font-bold text-[#1C1917] tracking-tight mb-2">
              How it works
            </h2>
            <p className="text-[#57534E] text-[15px]">Connect your store and review its delivery setup.</p>
          </div>

          <div className="space-y-4">
            {[
              {
                num: '1',
                title: 'Install the app',
                desc: 'Open your store’s installation link and review the requested Shopify permissions.',
              },
              {
                num: '2',
                title: 'Set your pickup address',
                desc: 'Confirm your store address, pickup handoff, and service availability.',
              },
              {
                num: '3',
                title: 'Customers order, we deliver',
                desc: 'Review the eligible delivery option, quote, payment, and pickup handoff before enabling the flow.',
              },
            ].map((step) => (
              <div key={step.num} className="bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(28,25,23,0.06)] flex gap-5 items-start">
                <div className="w-10 h-10 rounded-full bg-[#b64017] text-white font-bold text-base flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step.num}
                </div>
                <div>
                  <h3 className="font-bold text-[#1C1917] text-[15px] mb-1">{step.title}</h3>
                  <p className="text-[#78716C] text-[14px] leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFITS ──────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-[#1C1917]">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[clamp(1.4rem,3.5vw,2rem)] font-bold text-white tracking-tight mb-2">
              Why boutiques choose Style.re
            </h2>
            <p className="text-[#A8A29E] text-[15px]">Built around the retail pickup and delivery handoff.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                stat: 'Store to door',
                label: 'Delivery planning',
                desc: 'Review availability and timing for your store.',
              },
              {
                stat: 'Get connected',
                label: 'Store setup',
                desc: 'Review installation and the store pickup handoff.',
              },
              {
                stat: 'Stay informed',
                label: 'Order tracking',
                desc: 'Follow confirmed order and delivery updates.',
              },
              {
                stat: 'Review plans',
                label: 'Merchant billing',
                desc: 'Compare current monthly plans before signing up.',
              },
            ].map((b) => (
              <div key={b.label} className="bg-white/5 border border-white/10 rounded-3xl p-5">
                <div className="text-[1.75rem] font-bold text-[#E8621A] leading-none mb-1">{b.stat}</div>
                <div className="text-[14px] font-semibold text-[#A8A29E] uppercase tracking-wide mb-2">{b.label}</div>
                <p className="text-[#A8A29E] text-[14px] leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INSTALL FORM ──────────────────────────────────────────── */}
      <section className="px-6 py-16" ref={formRef}>
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-[clamp(1.4rem,3.5vw,2rem)] font-bold text-[#1C1917] tracking-tight mb-2">
              Get your install link
            </h2>
            <p className="text-[#78716C] text-[15px]">Enter your Shopify store name below.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="shop-input" className="block text-[13px] font-semibold text-[#1C1917] mb-2">
                Shopify store name <span className="text-[#A8A29E] font-normal">(e.g. your-store)</span>
              </label>
              <input
                id="shop-input"
                type="text"
                value={shopInput}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(e) => {
                  setShopInput(e.target.value);
                  setInstallUrl(null);
                  setError('');
                }}
                placeholder="your-store-name"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!!error}
                aria-describedby={error ? 'shop-input-error' : undefined}
                className={`w-full border-2 rounded-2xl px-4 py-3.5 text-[16px] text-[#1C1917] bg-white outline-none transition-all duration-150 placeholder:text-[#78716C] ${
                  focused ? 'border-[#E8621A] shadow-[0_0_0_3px_rgba(232,98,26,0.12)]' : 'border-[#EEEBE8]'
                } ${error ? 'border-red-400' : ''}`}
              />
              {error && (
                <p id="shop-input-error" role="alert" className="text-red-700 text-[14px] mt-2 font-medium">{error}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-[#b64017] text-white font-bold rounded-2xl py-4 text-[15px] tracking-wide active:scale-[0.98] transition-all duration-150 min-h-[52px]"
            >
              Get Install Link →
            </button>

            {installUrl && (
              <div className="bg-white border border-[#EEEBE8] rounded-3xl p-5 shadow-[0_2px_12px_rgba(28,25,23,0.06)]">
                <p role="status" className="text-[14px] font-semibold text-[#78716C] mb-3">Your install link is ready</p>
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-[#1C1917] text-white text-center font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-all duration-150 mb-3"
                >
                  Install Style.re on Shopify →
                </a>
                <p className="text-[14px] text-[#57534E] text-center">
                  Opens a new tab to start installation. Shopify approval and store setup still need to be completed.
                </p>
              </div>
            )}
          </form>
        </div>
      </section>

      </main>

      {/* ── FOOTER ────────────────────────────────────────────────── */}
      <footer className="bg-[#1C1917] px-6 py-10 text-center">
        <img src={stylereLogoUrl} alt="Style.re" className="h-8 w-auto rounded-lg object-contain mx-auto mb-5 opacity-80" />
        <p className="text-[#A8A29E] text-[14px] mb-2">
          Powered by Style.re · Retail pickup and delivery
        </p>
        <p className="text-[#A8A29E] text-[14px]">
          Questions?{' '}
          <a href="sms:+13464755016" className="text-[#E8621A] font-medium">
            Text us: (346) 475-5016
          </a>
        </p>
      </footer>
    </div>
  );
};

export default MerchantLanding;
