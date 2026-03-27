import React from 'react';
import stylereLogoUrl from '../assets/stylere_logo.jpg';

export const TermsOfService: React.FC = () => {
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
        <h1 className="text-4xl font-bold text-[#1C1917] mb-3 tracking-tight">Terms of Service</h1>
        <p className="text-[#78716C] text-sm mb-10">
          Last updated: March 23, 2025 &nbsp;·&nbsp; Style.re Unlimited Co., a Delaware company
        </p>

        <Section title="1. Agreement to Terms">
          <p>
            These Terms of Service ("Terms") govern your use of the Storree: Local Fashion Delivery application
            (the "App" or "Service") provided by Style.re Unlimited Co. ("Style.re," "Storree," "we," "our,"
            or "us"), a Delaware company.
          </p>
          <p className="mt-3">
            By installing or using the App, you ("Merchant") agree to be bound by these Terms. If you do not
            agree to these Terms, do not install or use the App.
          </p>
        </Section>

        <Section title="2. Service Description">
          <p>
            Storree provides same-hour local delivery for Shopify merchants. The Service enables:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Integration of a "local delivery" shipping option at your Shopify checkout</li>
            <li>Automatic dispatch of couriers upon order placement</li>
            <li>Real-time delivery tracking for customers</li>
            <li>SMS and email notifications throughout the delivery process</li>
          </ul>
          <p className="mt-3">
            Storree acts as a platform connecting merchants with third-party courier services. We are not
            ourselves a courier or logistics carrier.
          </p>
        </Section>

        <Section title="3. Merchant Account & Responsibilities">
          <p>As a Merchant, you are responsible for:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Maintaining a valid Shopify store in good standing</li>
            <li>Providing an accurate pickup address and store operating hours</li>
            <li>Ensuring products offered for delivery are legal, properly described, and available for pickup</li>
            <li>Having orders ready for courier pickup within a reasonable time after order placement</li>
            <li>Maintaining accurate contact information for support and billing</li>
            <li>Complying with all applicable local laws regarding the sale and delivery of goods</li>
            <li>Ensuring your customers are aware of and consent to the delivery terms</li>
          </ul>
        </Section>

        <Section title="4. Delivery Service Level Agreement">
          <p>
            <strong>Best-Effort Service.</strong> Storree facilitates same-hour delivery on a best-effort basis.
            We do not guarantee specific delivery windows, delivery times, or successful delivery in all
            circumstances.
          </p>
          <p className="mt-3">
            Delivery may be impacted by factors outside our control, including:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Courier availability in your area at the time of order</li>
            <li>Traffic, weather, or road conditions</li>
            <li>Inaccurate pickup or delivery addresses</li>
            <li>Customer unavailability at the delivery address</li>
            <li>Third-party courier platform outages</li>
          </ul>
          <p className="mt-3">
            <strong>No Delivery Guarantee.</strong> Style.re expressly disclaims any guarantee of delivery
            completion, delivery time, or delivery cost. In the event of a failed delivery, Merchants should
            contact support at <a href="mailto:ryan@stylere.app" className="underline text-[#1C1917]">ryan@stylere.app</a> or
            (346) 475-5016 for resolution.
          </p>
        </Section>

        <Section title="5. Payment Terms">
          <p>
            <strong>Free to Install.</strong> There is no monthly subscription fee for the App.
          </p>
          <p className="mt-3">
            <strong>Per-Delivery Fees.</strong> Merchants pay a per-delivery fee for each fulfilled delivery.
            Fees vary based on delivery distance, courier availability, and applicable surge pricing. Current
            rates are displayed within the App prior to enabling delivery for your store.
          </p>
          <p className="mt-3">
            <strong>Payment Processing.</strong> Payments are processed via Stripe. By using the Service, you
            agree to Stripe's Terms of Service. Style.re reserves the right to modify per-delivery pricing
            with 14 days' notice.
          </p>
          <p className="mt-3">
            <strong>Disputes.</strong> Billing disputes must be raised within 30 days of the charge by
            contacting <a href="mailto:ryan@stylere.app" className="underline text-[#1C1917]">ryan@stylere.app</a>.
          </p>
        </Section>

        <Section title="6. Prohibited Uses">
          <p>You may not use the Service to deliver:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Alcohol, tobacco, or cannabis products (unless you have obtained all required local licenses and receive explicit written approval from Style.re)</li>
            <li>Firearms, ammunition, or weapons of any kind</li>
            <li>Controlled substances or illegal drugs</li>
            <li>Hazardous, flammable, or toxic materials</li>
            <li>Live animals</li>
            <li>Any items prohibited by federal, state, or local law</li>
          </ul>
          <p className="mt-3">
            You may not use the Service to engage in fraudulent activity, misrepresent your products, or
            violate any applicable law. Violation of these prohibitions may result in immediate account
            termination and may be reported to appropriate authorities.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            The App and all associated content, trademarks, and technology are the exclusive property of
            Style.re Unlimited Co. and are protected by applicable intellectual property laws. You are granted
            a limited, non-exclusive, non-transferable license to use the App solely in connection with your
            Shopify store.
          </p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL STYLE.RE, ITS OFFICERS,
            DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
            <li>LOST PROFITS, LOST REVENUE, OR LOST BUSINESS OPPORTUNITIES</li>
            <li>DAMAGES ARISING FROM FAILED, DELAYED, OR INCOMPLETE DELIVERIES</li>
            <li>DAMAGES FROM THIRD-PARTY COURIER ACTIONS OR OMISSIONS</li>
          </ul>
          <p className="mt-3">
            STYLE.RE'S TOTAL AGGREGATE LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT
            EXCEED THE TOTAL FEES PAID BY YOU TO STYLE.RE IN THE THREE (3) MONTHS PRECEDING THE CLAIM.
          </p>
        </Section>

        <Section title="9. Disclaimer of Warranties">
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
            IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT. STYLE.RE DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
            OR THAT DEFECTS WILL BE CORRECTED.
          </p>
        </Section>

        <Section title="10. Indemnification">
          <p>
            You agree to indemnify, defend, and hold harmless Style.re and its affiliates, officers, directors,
            employees, and agents from and against any claims, liabilities, damages, losses, and expenses
            (including reasonable attorneys' fees) arising out of or in any way connected with your use of the
            Service, violation of these Terms, or violation of any third-party rights.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            Either party may terminate these Terms at any time by uninstalling the App (Merchant) or
            suspending access (Style.re). Style.re may terminate or suspend your access immediately, without
            notice, for violation of these Terms or for any other reason at our discretion.
          </p>
          <p className="mt-3">
            Upon termination, all licenses granted herein will terminate, and you must cease all use of the
            App. Sections 8, 9, 10, and 12 survive termination.
          </p>
        </Section>

        <Section title="12. Governing Law & Disputes">
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the State of
            Delaware, without regard to its conflict of law provisions.
          </p>
          <p className="mt-3">
            Any dispute arising out of or relating to these Terms or the Service shall be resolved by binding
            arbitration in accordance with the American Arbitration Association's Commercial Arbitration Rules,
            conducted in Delaware. You waive any right to participate in a class-action lawsuit or class-wide
            arbitration.
          </p>
        </Section>

        <Section title="13. Changes to Terms">
          <p>
            We reserve the right to modify these Terms at any time. We will provide notice of material changes
            via email or in-app notification at least 14 days before the changes take effect. Your continued
            use of the Service after changes take effect constitutes your acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="14. Contact Us">
          <p>For questions about these Terms:</p>
          <div className="mt-4 bg-white rounded-2xl p-6 border border-[#E7E5E4]">
            <p className="font-semibold text-[#1C1917]">Style.re Unlimited Co.</p>
            <p className="text-[#78716C] mt-1">Delaware, United States</p>
            <p className="mt-2">
              <a href="mailto:ryan@stylere.app" className="text-[#1C1917] font-medium underline">ryan@stylere.app</a>
            </p>
            <p className="mt-1 text-[#78716C]">(346) 475-5016</p>
          </div>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E7E5E4] px-6 py-8 text-center">
        <p className="text-[#A8A29E] text-sm">
          © {new Date().getFullYear()} Style.re Unlimited Co. All rights reserved.
          &nbsp;·&nbsp;
          <a href="/shopify/privacy" className="hover:text-[#1C1917] transition-colors">Privacy Policy</a>
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

export default TermsOfService;
