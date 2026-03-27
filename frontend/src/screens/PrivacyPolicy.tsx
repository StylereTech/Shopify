import React from 'react';
import stylereLogoUrl from '../assets/stylere_logo.jpg';

export const PrivacyPolicy: React.FC = () => {
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

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-[#1C1917] mb-3 tracking-tight">Privacy Policy</h1>
        <p className="text-[#78716C] text-sm mb-10">
          Last updated: March 23, 2025 &nbsp;·&nbsp; Style.re Unlimited Co., a Delaware company
        </p>

        <Section title="1. Introduction">
          <p>
            Style.re Unlimited Co. ("Style.re," "Storree," "we," "our," or "us") operates the Storree: Local
            Fashion Delivery application available on the Shopify App Store (the "App"). This Privacy Policy
            explains how we collect, use, disclose, and safeguard information when you install and use our App.
          </p>
          <p className="mt-3">
            By installing or using the App, you agree to the terms of this Privacy Policy. If you do not agree,
            please uninstall the App and discontinue use.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <Subsection title="2.1 Merchant Information">
            <ul className="list-disc pl-5 space-y-1">
              <li>Shopify shop domain (e.g., your-store.myshopify.com)</li>
              <li>Merchant email address provided by Shopify during OAuth installation</li>
              <li>Store pickup address and location data configured within the App</li>
              <li>Access tokens issued by Shopify to interact with your store on your behalf</li>
            </ul>
          </Subsection>
          <Subsection title="2.2 Order & Customer Information">
            <p>When a customer places a delivery order through your store, we receive:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Customer name and delivery address</li>
              <li>Customer phone number (for delivery notifications)</li>
              <li>Order ID, line items, and order total from Shopify</li>
              <li>Payment confirmation status (we do not store raw card data)</li>
            </ul>
          </Subsection>
          <Subsection title="2.3 Usage & Technical Information">
            <ul className="list-disc pl-5 space-y-1">
              <li>App interaction logs (feature usage, errors)</li>
              <li>IP addresses for security and fraud prevention</li>
              <li>Browser/device type for app compatibility</li>
            </ul>
          </Subsection>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use collected information to:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong>Dispatch deliveries</strong> — transmit pickup and drop-off addresses to our courier partners</li>
            <li><strong>Provide live tracking</strong> — share real-time courier location with customers</li>
            <li><strong>Send notifications</strong> — SMS and email updates to customers about their delivery status</li>
            <li><strong>Process payments</strong> — collect per-delivery fees from merchants via Stripe</li>
            <li><strong>Provide customer support</strong> — respond to merchant and customer inquiries</li>
            <li><strong>Improve the App</strong> — analyze usage patterns to improve features and reliability</li>
            <li><strong>Comply with legal obligations</strong> — retain records as required by applicable law</li>
          </ul>
        </Section>

        <Section title="4. Third-Party Services">
          <p>We share data with the following third parties solely to provide the Service:</p>
          <div className="mt-4 space-y-4">
            <ThirdParty name="Shopify" purpose="App platform, OAuth authentication, order data" link="https://www.shopify.com/legal/privacy" />
            <ThirdParty name="DoorDash Drive" purpose="Courier dispatch and delivery fulfillment" link="https://www.doordash.com/privacy/" />
            <ThirdParty name="Stripe" purpose="Payment processing for per-delivery fees" link="https://stripe.com/privacy" />
            <ThirdParty name="Twilio" purpose="SMS notifications to customers and couriers" link="https://www.twilio.com/en-us/legal/privacy" />
          </div>
          <p className="mt-4 text-sm text-[#78716C]">
            We do not sell your personal information to third parties for advertising or marketing purposes.
          </p>
        </Section>

        <Section title="5. Data Retention">
          <p>We retain data as follows:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong>Merchant account data</strong> — retained for the duration of App installation plus 90 days after uninstall</li>
            <li><strong>Order and delivery records</strong> — retained for 2 years for accounting and dispute resolution</li>
            <li><strong>Customer delivery addresses</strong> — retained for 90 days after order fulfillment, then deleted</li>
            <li><strong>Access tokens</strong> — deleted immediately upon App uninstall via Shopify webhook</li>
          </ul>
          <p className="mt-3">
            Upon receiving a GDPR erasure request, we will delete personal data within 30 days to the extent
            permitted by applicable law.
          </p>
        </Section>

        <Section title="6. GDPR Compliance (EEA Merchants & Customers)">
          <p>
            If you or your customers are located in the European Economic Area (EEA), you have the following
            rights under the General Data Protection Regulation (GDPR):
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong>Right of Access</strong> — request a copy of personal data we hold about you</li>
            <li><strong>Right to Rectification</strong> — request correction of inaccurate data</li>
            <li><strong>Right to Erasure</strong> — request deletion of your personal data</li>
            <li><strong>Right to Restriction</strong> — request we limit how we process your data</li>
            <li><strong>Right to Data Portability</strong> — receive your data in a machine-readable format</li>
            <li><strong>Right to Object</strong> — object to processing based on legitimate interests</li>
          </ul>
          <p className="mt-3">
            We process customer data on behalf of merchants (acting as a data processor). Merchants are the
            data controllers responsible for their customers' data under GDPR.
          </p>
          <p className="mt-3">
            We respond to GDPR webhooks sent by Shopify for customer data requests, customer data erasure, and
            shop data erasure within the required timeframes.
          </p>
        </Section>

        <Section title="7. CCPA Rights (California Residents)">
          <p>If you are a California resident, you have the right to:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Know what personal information we collect and how it is used</li>
            <li>Delete personal information we have collected (subject to certain exceptions)</li>
            <li>Opt out of the sale of personal information — <em>we do not sell personal information</em></li>
            <li>Non-discrimination for exercising your CCPA rights</li>
          </ul>
          <p className="mt-3">To exercise your rights, contact us at <a href="mailto:ryan@stylere.app" className="text-[#1C1917] underline">ryan@stylere.app</a>.</p>
        </Section>

        <Section title="8. Data Security">
          <p>
            We implement industry-standard security measures including TLS encryption in transit, encrypted
            storage at rest, and access controls limited to authorized personnel. However, no method of
            transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>
            The App is intended for use by businesses (merchants) and is not directed at individuals under the
            age of 13. We do not knowingly collect personal information from children under 13.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify merchants of material changes
            via email or in-app notification. Your continued use of the App after changes become effective
            constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>For privacy-related questions, requests, or concerns:</p>
          <div className="mt-4 bg-white rounded-2xl p-6 border border-[#E7E5E4]">
            <p className="font-semibold text-[#1C1917]">Style.re Unlimited Co.</p>
            <p className="text-[#78716C] mt-1">Delaware, United States</p>
            <p className="mt-2">
              <a href="mailto:ryan@stylere.app" className="text-[#1C1917] font-medium underline">ryan@stylere.app</a>
            </p>
          </div>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E7E5E4] px-6 py-8 text-center">
        <p className="text-[#A8A29E] text-sm">
          © {new Date().getFullYear()} Style.re Unlimited Co. All rights reserved.
          &nbsp;·&nbsp;
          <a href="/shopify/terms" className="hover:text-[#1C1917] transition-colors">Terms of Service</a>
          &nbsp;·&nbsp;
          <a href="/shopify/support" className="hover:text-[#1C1917] transition-colors">Support</a>
        </p>
      </footer>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-xl font-bold text-[#1C1917] mb-4 pb-2 border-b border-[#E7E5E4]">{title}</h2>
    <div className="text-[#44403C] leading-relaxed space-y-2">{children}</div>
  </section>
);

const Subsection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-4">
    <h3 className="font-semibold text-[#1C1917] mb-2">{title}</h3>
    <div className="text-[#44403C] leading-relaxed">{children}</div>
  </div>
);

const ThirdParty: React.FC<{ name: string; purpose: string; link: string }> = ({ name, purpose, link }) => (
  <div className="flex gap-3 items-start">
    <div className="w-2 h-2 rounded-full bg-[#1C1917] mt-2 flex-shrink-0" />
    <div>
      <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1C1917] underline">{name}</a>
      <span className="text-[#78716C]"> — {purpose}</span>
    </div>
  </div>
);

export default PrivacyPolicy;
