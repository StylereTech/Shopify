import React, { useRef, useState } from 'react';
import stylereLogoUrl from '../assets/stylere_logo.jpg';
import heroBg from '../assets/hero.png';

// No token needed — begin-install is a public endpoint
const BASE_URL = 'https://api-production-653e.up.railway.app/shopify/begin-install';

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

    let shop = shopInput.trim().toLowerCase();
    if (!shop) {
      setError('Enter your Shopify store name to continue.');
      return;
    }

    // Strip URL junk — https://, http://, paths, trailing slashes
    shop = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

    // Extract just the store handle (before .myshopify.com or .com)
    shop = shop.replace(/\.myshopify\.com$/, '').replace(/\.myshopify$/, '').replace(/\.com$/, '');
    shop = `${shop}.myshopify.com`;

    const shopName = shop.replace('.myshopify.com', '');
    if (!/^[a-z0-9-]+$/.test(shopName)) {
      setError('Store name can only contain letters, numbers, and hyphens. Example: your-store');
      return;
    }

    const url = `${BASE_URL}?shop=${encodeURIComponent(shop)}`;
    setInstallUrl(url);
  };

  return (
    <div className="font-sans bg-[#FAF9F7] text-[#1C1917] min-h-screen overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section style={{ background: '#1C1917' }}>
        {/* Text block — clean, no image behind it */}
        <div className="px-6 pt-12 pb-8 text-center">
          <div className="max-w-lg mx-auto flex flex-col items-center gap-5">
            <img src={stylereLogoUrl} alt="Style.re" className="h-10 w-auto rounded-xl object-contain" />

            <h1 className="text-[clamp(1.75rem,5vw,2.8rem)] font-bold text-white leading-[1.12] tracking-tight">
              Offer same-hour delivery.<br />Keep every sale.
            </h1>
            <p className="text-[#A8A29E] text-[clamp(0.9rem,2vw,1.05rem)] leading-relaxed max-w-sm mx-auto">
              Add Storree to your Shopify store in 2 minutes. Your customers get fashion delivered within the hour.
            </p>

            <button
              onClick={scrollToForm}
              className="bg-[#E8621A] text-white font-bold rounded-2xl px-8 py-4 text-[15px] tracking-wide active:scale-[0.98] transition-all duration-150 shadow-[0_4px_24px_rgba(232,98,26,0.35)] min-h-[52px]"
            >
              Install Free →
            </button>

            <p className="text-[#57534E] text-[12px]">
              Pay per delivery · Cancel anytime · Works with any Shopify store
            </p>
          </div>
        </div>

        {/* Hero image — below text, full width, no overlap */}
        <div className="w-full overflow-hidden" style={{ maxHeight: '380px' }}>
          <img
            src={heroBg}
            alt="Storree delivery"
            className="w-full object-cover object-top"
            style={{ display: 'block', maxHeight: '380px' }}
          />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[clamp(1.4rem,3.5vw,2rem)] font-bold text-[#1C1917] tracking-tight mb-2">
              How it works
            </h2>
            <p className="text-[#78716C] text-[15px]">Up and running before lunch.</p>
          </div>

          <div className="space-y-4">
            {[
              {
                num: '1',
                title: 'Install the app',
                desc: 'Connect Storree to your Shopify store in 2 clicks. No code required.',
              },
              {
                num: '2',
                title: 'Set your pickup address',
                desc: "Tell us where your store is located. We handle everything else.",
              },
              {
                num: '3',
                title: 'Customers order, we deliver',
                desc: 'Shoppers see same-hour delivery at checkout. We dispatch a courier immediately.',
              },
            ].map((step) => (
              <div key={step.num} className="bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(28,25,23,0.06)] flex gap-5 items-start">
                <div className="w-10 h-10 rounded-full bg-[#E8621A] text-white font-bold text-base flex items-center justify-center flex-shrink-0 mt-0.5">
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
              Why boutiques choose Storree
            </h2>
            <p className="text-[#78716C] text-[15px]">Built for fashion retail. Designed around speed.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              {
                stat: '~1 hr',
                label: 'Average delivery',
                desc: 'From store to door in under an hour.',
              },
              {
                stat: '2 min',
                label: 'Setup time',
                desc: 'Install, configure, and go live fast.',
              },
              {
                stat: 'Live',
                label: 'Order tracking',
                desc: 'Customers track every step in real time.',
              },
              {
                stat: '$0',
                label: 'Monthly fee',
                desc: 'No subscription. Pay only when you deliver.',
              },
            ].map((b) => (
              <div key={b.label} className="bg-white/5 border border-white/10 rounded-3xl p-5">
                <div className="text-[1.75rem] font-bold text-[#E8621A] leading-none mb-1">{b.stat}</div>
                <div className="text-[11px] font-semibold text-[#78716C] uppercase tracking-widest mb-2">{b.label}</div>
                <p className="text-[#A8A29E] text-[13px] leading-relaxed">{b.desc}</p>
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
                className={`w-full border-2 rounded-2xl px-4 py-3.5 text-[15px] text-[#1C1917] bg-white outline-none transition-all duration-150 placeholder:text-[#C4BFB9] ${
                  focused ? 'border-[#E8621A] shadow-[0_0_0_3px_rgba(232,98,26,0.12)]' : 'border-[#EEEBE8]'
                } ${error ? 'border-red-400' : ''}`}
              />
              {error && (
                <p className="text-red-500 text-[13px] mt-2 font-medium">{error}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-[#E8621A] text-white font-bold rounded-2xl py-4 text-[15px] tracking-wide active:scale-[0.98] transition-all duration-150 min-h-[52px]"
            >
              Get Install Link →
            </button>

            {installUrl && (
              <div className="bg-white border border-[#EEEBE8] rounded-3xl p-5 shadow-[0_2px_12px_rgba(28,25,23,0.06)]">
                <p className="text-[12px] font-semibold text-[#78716C] uppercase tracking-wider mb-3">Your install link is ready</p>
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-[#1C1917] text-white text-center font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-all duration-150 mb-3"
                >
                  Install Storree on Shopify →
                </a>
                <p className="text-[12px] text-[#A8A29E] text-center">
                  You'll be taken to Shopify to approve the app.
                </p>
              </div>
            )}
          </form>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────── */}
      <footer className="bg-[#1C1917] px-6 py-10 text-center">
        <img src={stylereLogoUrl} alt="Style.re" className="h-8 w-auto rounded-lg object-contain mx-auto mb-5 opacity-80" />
        <p className="text-[#78716C] text-[13px] mb-2">
          Powered by Style.re · Same-hour fashion delivery
        </p>
        <p className="text-[#78716C] text-[13px]">
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
