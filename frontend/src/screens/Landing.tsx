import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import stylereLogoUrl from '../assets/stylere_logo.jpg';

const DeliveryIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="1"/>
    <path d="M16 8h4l3 5v3h-7V8z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/>
    <circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);

const trust = [
  { icon: '⚡', label: 'Under 1 hour' },
  { icon: '🔐', label: 'Secure checkout' },
  { icon: '📍', label: 'Live tracking' },
  { icon: '🛍️', label: 'Any retailer' },
];

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { setServiceType } = useOrderStore();

  const handleStart = () => {
    setServiceType('item_delivery');
    navigate('/address');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FAF9F7]">

      {/* Header */}
      <header className="px-6 pt-12 pb-0 flex items-center justify-between">
        <img src={stylereLogoUrl} alt="Style.re" className="h-9 w-auto rounded-xl object-contain" />
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-[#78716C]">Available now</span>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-8 pb-6">
        <p className="text-xs font-semibold text-[#E8621A] uppercase tracking-widest mb-3">
          Same-Hour Delivery
        </p>
        <h1 className="text-[2rem] font-bold text-[#1C1917] leading-[1.15] tracking-tight mb-3">
          From the store<br />
          <span className="text-[#E8621A]">to your door.</span>
        </h1>
        <p className="text-[15px] text-[#78716C] leading-relaxed max-w-[280px]">
          We pick up your fashion order and deliver it within the hour.
        </p>
      </section>

      {/* Trust strip */}
      <section className="px-6 mb-8">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {trust.map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 bg-white border border-[#EEEBE8] rounded-full px-3.5 py-2 flex-shrink-0 shadow-sm">
              <span className="text-sm">{icon}</span>
              <span className="text-xs font-medium text-[#57534E] whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Service Card — single, always selected */}
      <section className="px-5 flex-1">
        <div className="relative overflow-hidden rounded-3xl border-2 border-[#E8621A] shadow-[0_8px_32px_rgba(232,98,26,0.14)] bg-white">
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#E8621A] to-[#F97316]" />

          <div className="p-6">
            {/* Top row */}
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#FFF0E8] text-[#E8621A] flex items-center justify-center">
                <DeliveryIcon />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-[#1C1917]">~1 hr</div>
                <div className="text-[11px] text-[#A8A29E] uppercase tracking-wide mt-0.5">Guaranteed delivery</div>
              </div>
            </div>

            {/* Label */}
            <h2 className="text-2xl font-bold text-[#1C1917] tracking-tight mb-2">Store to Door</h2>
            <p className="text-[15px] text-[#78716C] leading-relaxed mb-6">
              Tell us the store and item. We pick it up and deliver it directly to you — within the hour.
            </p>

            {/* How it works */}
            <div className="bg-[#FAF9F7] rounded-2xl p-4 mb-6 space-y-3">
              {[
                { step: '1', text: 'Choose your store & item' },
                { step: '2', text: 'We dispatch a runner immediately' },
                { step: '3', text: 'Track delivery live to your door' },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#E8621A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {step}
                  </div>
                  <span className="text-sm text-[#57534E] font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="px-5 pt-6 pb-10">
        <button
          onClick={handleStart}
          className="w-full py-4 rounded-2xl text-base font-bold tracking-wide bg-[#1C1917] text-white shadow-[0_4px_20px_rgba(28,25,23,0.25)] hover:bg-[#2C2825] active:scale-[0.98] transition-all duration-200"
        >
          Get Started →
        </button>
        <p className="text-center text-[11px] text-[#C4BFB9] mt-3">
          Free cancellation · No subscription required
        </p>
      </div>

    </div>
  );
};
