import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import stylereLogoUrl from '../assets/stylere_logo.jpg';

const DeliveryIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="1.5"/>
    <path d="M16 8h4l3 5v3h-7V8z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/>
    <circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);

const trust = [
  { icon: '⚡', label: 'Under 1 hour' },
  { icon: '🔐', label: 'Secure checkout' },
  { icon: '📍', label: 'Live tracking' },
  { icon: '🛍️', label: 'Any boutique' },
  { icon: '✅', label: 'No subscription' },
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
      <header className="px-6 pt-10 pb-0 flex items-center justify-between">
        <img src={stylereLogoUrl} alt="Style.re" className="h-9 w-auto rounded-xl object-contain" />
        <div className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 shadow-sm border border-[#EEEBE8]">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-[#57534E]">Available now</span>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-10 pb-6">
        <p className="text-xs font-bold text-[#E8621A] uppercase tracking-[0.18em] mb-4">
          Same-hour delivery
        </p>
        <h1 className="text-[2.1rem] font-bold text-[#1C1917] leading-[1.12] tracking-tight mb-4">
          From the store<br />to your door.
        </h1>
        <p className="text-[15px] text-[#78716C] leading-relaxed max-w-[300px]">
          We pick up your fashion order and deliver it within the hour — live tracking included.
        </p>
      </section>

      {/* Trust pills */}
      <section className="px-6 mb-8">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
          {trust.map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 bg-white rounded-full px-3.5 py-2 flex-shrink-0 shadow-sm border border-[#EEEBE8]">
              <span className="text-sm leading-none">{icon}</span>
              <span className="text-xs font-medium text-[#57534E] whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Service Card */}
      <section className="px-5 flex-1">
        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(28,25,23,0.08)] overflow-hidden">
          {/* Color band */}
          <div className="h-1 bg-gradient-to-r from-[#E8621A] to-[#F97316]" />

          <div className="p-6">
            {/* Icon + timing */}
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-[#FFF3EE] text-[#E8621A] flex items-center justify-center">
                <DeliveryIcon />
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-[#1C1917] tracking-tight">~1 hr</div>
                <div className="text-[11px] text-[#A8A29E] uppercase tracking-wide mt-0.5 font-medium">Same-hour delivery</div>
              </div>
            </div>

            {/* Name + description */}
            <h2 className="text-xl font-bold text-[#1C1917] tracking-tight mb-2">Store to Door</h2>
            <p className="text-[14px] text-[#78716C] leading-relaxed mb-6">
              Tell us your store and item. We pick it up and bring it directly to you.
            </p>

            {/* Divider */}
            <div className="h-px bg-[#F0EDE9] mb-5" />

            {/* Steps — lean version */}
            <div className="space-y-2.5">
              {[
                'Choose your store and item',
                'Runner dispatched immediately',
                'Track delivery live to your door',
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#E8621A] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-[13px] text-[#57534E]">{text}</span>
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
          className="w-full py-4 rounded-2xl text-[15px] font-bold tracking-wide bg-[#1C1917] text-white shadow-[0_4px_20px_rgba(28,25,23,0.2)] active:scale-[0.98] transition-all duration-150"
        >
          Get Started →
        </button>
        <p className="text-center text-[11px] text-[#C4BFB9] mt-3">
          Free cancellation · No monthly fees
        </p>
      </div>

    </div>
  );
};
