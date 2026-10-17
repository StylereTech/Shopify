import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';

const FAQS = [
  { q: 'How do I arrange a delivery?', a: <>Start with the pickup address, destination, and contact details. Save the request to review its price before choosing an available payment method. Have your merchandise order ready for collection.</> },
  { q: 'Where is delivery available?', a: <>Coverage depends on the pickup and destination addresses and courier availability. Enter the actual locations for your request. A saved order or payment does not guarantee a courier or a delivery time.</> },
  { q: 'How much does delivery cost?', a: <>Review the saved delivery price before authorizing payment. Retailer account pricing depends on the selected plan; see <Link to="/merchant/pricing">current merchant plans</Link> for details.</> },
  { q: 'Where can I see order updates?', a: <>Open <Link to="/orders">your orders</Link> in the browser session used for checkout. The order page shows recorded status updates. A courier tracking link is shown only when the delivery provider supplies one; a live map is not always available.</> },
  { q: 'Can I message my courier here?', a: <>Courier chat is not connected in this app. Use the support contacts below and include your order reference. Do not send full card details or passwords.</> },
  { q: 'What should I do if payment or delivery is not confirmed?', a: <>Open the saved order and check payment status before paying again. If an order cannot be delivered, contact support for assistance. A delivery issue or cancellation does not by itself confirm that a refund has been issued.</> },
  { q: 'How do retailers get started?', a: <>Review the <Link to="/merchant/pricing">merchant plans</Link>, create an account, and complete the required setup. Existing retailers can <Link to="/merchant/login">sign in</Link> to manage their account.</> },
  { q: 'What happens to my order data?', a: <>The order-data retention policy is 90 days after each order is completed. See the <Link to="/privacy">Privacy Policy</Link> for details and contact information for data requests. Uninstalling the Shopify app is a separate account action.</> },
];
export function SupportPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return <AppShell title="How can we help?" showBack backTo="/order"><div className="customer-stack">
    <p className="customer-muted">Find answers about delivery, payments, and retailer accounts, or contact our support team.</p>
    <section className="customer-card" aria-labelledby="support-contact-title"><h2 id="support-contact-title">Support options</h2><p>Include your order reference and a short description of the issue. Response times vary.</p><div className="customer-actions"><a className="customer-button" href="mailto:ryan@stylere.app">Email support</a><a className="customer-button secondary" href="sms:+13464755016">Text (346) 475-5016</a></div><p className="customer-muted">Email: ryan@stylere.app</p></section>
    <h2>Frequently asked questions</h2>
    {FAQS.map((faq, index) => <section className="customer-card customer-faq" key={faq.q}><h3><button type="button" id={'customer-faq-question-' + index} aria-expanded={openIndex === index} aria-controls={'customer-faq-answer-' + index} onClick={() => setOpenIndex(previous => previous === index ? null : index)}>{faq.q}<span aria-hidden="true">{openIndex === index ? '−' : '+'}</span></button></h3><div id={'customer-faq-answer-' + index} role="region" aria-labelledby={'customer-faq-question-' + index} hidden={openIndex !== index}>{faq.a}</div></section>)}
  </div></AppShell>;
}
export default SupportPage;