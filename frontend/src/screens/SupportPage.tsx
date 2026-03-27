import React, { useState } from 'react';
import stylereLogoUrl from '../assets/stylere_logo.jpg';

const FAQS = [
  {
    q: 'How do I install Storree on my Shopify store?',
    a: 'Visit the Storree listing on the Shopify App Store and click "Add app." You\'ll be prompted to authorize the required permissions. Once installed, open the app from your Shopify admin and enter your store\'s pickup address to go live. Setup takes about 2 minutes.',
  },
  {
    q: 'What areas do you currently deliver to?',
    a: 'Storree is currently available for stores located in the United States. Delivery coverage depends on courier availability in your city. During the setup flow, we\'ll confirm whether same-hour delivery is available in your area.',
  },
  {
    q: 'How much does delivery cost?',
    a: 'Storree is free to install — no monthly fees, no subscription. You only pay a per-delivery fee when a customer places a delivery order. Fees vary based on delivery distance and are displayed in your app dashboard. Customers pay the delivery fee at checkout.',
  },
  {
    q: 'How does live tracking work?',
    a: 'Once a courier picks up the order from your store, your customer receives an SMS with a tracking link. The tracking page shows the courier\'s real-time location on a map, estimated arrival time, and delivery status updates.',
  },
  {
    q: 'What happens if a delivery fails or the courier can\'t find the customer?',
    a: 'If a delivery attempt fails (customer not home, wrong address, etc.), the courier will attempt to contact the customer. If delivery cannot be completed, the item is returned to your store. Contact our support team at ryan@stylere.app or (346) 475-5016 to resolve any delivery issues.',
  },
  {
    q: 'Does Storree require any code changes to my store?',
    a: 'No code changes required. Storree integrates with Shopify\'s native carrier service API to add the delivery option at checkout. Everything is configured through the app dashboard — no theme editing needed.',
  },
  {
    q: 'How do I uninstall the app?',
    a: 'To uninstall, go to your Shopify Admin → Settings → Apps and sales channels → find Storree → click Delete. This will remove the app and revoke all access. Your order history data will be retained per our Privacy Policy and deleted after 90 days.',
  },
];

export const SupportPage: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className="font-sans bg-[#FAF9F7] text-[#1C1917] min-h-screen">
      {/* Header */}
      <header className="bg-[#1C1917] px-6 py-5 flex items-center justify-between">
        <a href="/shopify" className="flex items-center gap-3">
          <img src={stylereLogoUrl} alt="Style.re" className="h-9 w-auto rounded-lg object-contain" />
        </a>
        <a href="/shopify" className="text-[#A8A29E] text-sm hover:text-white transition-colors">
          ← Back to home
        </a>
      </header>

      {/* Hero */}
      <div className="bg-[#1C1917] px-6 pt-10 pb-14 text-center">
        <div className="max-w-xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">How can we help?</h1>
          <p className="text-[#A8A29E] text-base leading-relaxed">
            Browse common questions below or reach out directly — we're fast.
          </p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-6 py-14">

        {/* Contact Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-14">
          <ContactCard
            icon="💬"
            title="Text us"
            description="Fastest response — usually within minutes"
            action="SMS (346) 475-5016"
            href="sms:+13464755016"
          />
          <ContactCard
            icon="✉️"
            title="Email us"
            description="For detailed questions or account issues"
            action="ryan@stylere.app"
            href="mailto:ryan@stylere.app"
          />
        </div>

        {/* Merchant Landing CTA */}
        <div className="bg-[#1C1917] rounded-2xl p-6 mb-14 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-white font-semibold">New to Storree?</p>
            <p className="text-[#A8A29E] text-sm mt-1">See how same-hour delivery works for your store</p>
          </div>
          <a
            href="/shopify/merchant-landing"
            className="bg-white text-[#1C1917] font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-[#F5F4F2] transition-colors whitespace-nowrap"
          >
            Learn more →
          </a>
        </div>

        {/* FAQ */}
        <h2 className="text-2xl font-bold text-[#1C1917] mb-6">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E7E5E4] overflow-hidden">
              <button
                onClick={() => toggle(i)}
                className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-[#FAF9F7] transition-colors"
              >
                <span className="font-medium text-[#1C1917] leading-snug">{faq.q}</span>
                <span className="text-[#A8A29E] flex-shrink-0 text-xl leading-none">
                  {openIndex === i ? '−' : '+'}
                </span>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-5 text-[#44403C] text-sm leading-relaxed border-t border-[#F5F4F2] pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom contact */}
        <div className="mt-12 text-center">
          <p className="text-[#78716C] text-sm">
            Still need help?{' '}
            <a href="mailto:ryan@stylere.app" className="text-[#1C1917] font-medium underline">
              Send us an email
            </a>{' '}
            and we'll get back to you within a few hours.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E7E5E4] px-6 py-8 text-center">
        <p className="text-[#A8A29E] text-sm">
          © {new Date().getFullYear()} Style.re Unlimited Co. All rights reserved.
          &nbsp;·&nbsp;
          <a href="/shopify/privacy" className="hover:text-[#1C1917] transition-colors">Privacy Policy</a>
          &nbsp;·&nbsp;
          <a href="/shopify/terms" className="hover:text-[#1C1917] transition-colors">Terms of Service</a>
        </p>
      </footer>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const ContactCard: React.FC<{
  icon: string;
  title: string;
  description: string;
  action: string;
  href: string;
}> = ({ icon, title, description, action, href }) => (
  <a
    href={href}
    className="bg-white rounded-2xl border border-[#E7E5E4] p-6 flex flex-col gap-3 hover:border-[#1C1917] transition-colors group"
  >
    <span className="text-2xl">{icon}</span>
    <div>
      <p className="font-semibold text-[#1C1917]">{title}</p>
      <p className="text-[#78716C] text-sm mt-0.5">{description}</p>
    </div>
    <p className="text-[#1C1917] font-medium text-sm group-hover:underline">{action}</p>
  </a>
);

export default SupportPage;
