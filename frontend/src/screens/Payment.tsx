import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useOrderStore } from '../store/orderStore';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card } from '../components/ui';

const STRIPE_PK = import.meta.env.VITE_STRIPE_PK ||
  'pk_live_51SwwWxLFvcRfmHtcOesMNMFvFnVxLEpJUilnAdJwlkVxnONQMb28yGVCpxnUgPJHNKK6Ql1pDwFBYdWKdFcCm3G00CjCqsimr';

const stripePromise = loadStripe(STRIPE_PK);

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1C1917',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      '::placeholder': { color: '#C4BFB9' },
      iconColor: '#E8621A',
    },
    invalid: { color: '#EF4444', iconColor: '#EF4444' },
  },
};

const LockIcon = () => (
  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const PaymentForm: React.FC = () => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { draft, currentOrder, setOrderId, setPaymentIntentId, setCurrentOrder } = useOrderStore();

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setLocalPaymentIntentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const total = draft.pricing?.total ?? 10.78;
  const formatMoney = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

  useEffect(() => {
    const initialize = async () => {
      try {
        let orderId = draft.orderId;
        if (!orderId) {
          const order = await api.createOrder(draft);
          orderId = order.id;
          setOrderId(orderId);
          setCurrentOrder(order);
        }

        const pi = await api.createPaymentIntent(orderId, total);
        setClientSecret(pi.clientSecret);
        setLocalPaymentIntentId(pi.paymentIntentId);
        setPaymentIntentId(pi.paymentIntentId);
      } catch (err) {
        console.error('Payment init failed:', err);
        setError('Failed to initialize payment. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;

    setPaying(true);
    setError(null);

    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Card element not found');

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card } }
      );

      if (stripeError) {
        setError(stripeError.message ?? 'Payment failed');
        setPaying(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        const confirmResult = await api.confirmPayment(paymentIntentId, draft.orderId!);
        if ('trackingUrl' in confirmResult && confirmResult.trackingUrl && currentOrder) {
          setCurrentOrder({ ...currentOrder, doordashTrackingUrl: confirmResult.trackingUrl as string });
        }
        setSuccess(true);
        setTimeout(() => navigate('/confirmation'), 1000);
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-2 border-[#E8621A] border-t-transparent rounded-full animate-spin" />
        <p className="text-[14px] text-[#78716C]">Preparing secure payment…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center shadow-[0_4px_20px_rgba(34,197,94,0.15)]">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-[#1C1917] mb-1">Payment confirmed</p>
          <p className="text-[14px] text-[#78716C]">Dispatching your courier…</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handlePay} className="px-5 py-6 flex flex-col gap-5">

      {/* Order total */}
      <div className="bg-[#1C1917] rounded-3xl p-5 flex items-center justify-between">
        <div>
          <p className="text-white/50 text-[12px] uppercase tracking-wider mb-1">Total</p>
          <p className="text-3xl font-bold text-white tracking-tight">{formatMoney(total)}</p>
        </div>
        <div className="text-right">
          <p className="text-white/50 text-[12px]">Same-hour delivery</p>
          <p className="text-white/70 text-[13px] font-medium mt-0.5">Style.re</p>
        </div>
      </div>

      {/* Card Input */}
      <Card>
        <h2 className="font-bold text-[#1C1917] text-[15px] mb-4">Card Details</h2>
        <div className="border border-[#EEEBE8] rounded-2xl p-4 focus-within:border-[#E8621A] focus-within:ring-2 focus-within:ring-[#E8621A]/10 transition-all">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[#A8A29E]">
          <LockIcon />
          <span>256-bit encryption · Powered by Stripe</span>
        </div>
      </Card>

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-6">
        {['Visa', 'Mastercard', 'Amex', 'Discover'].map(b => (
          <span key={b} className="text-[11px] font-semibold text-[#C4BFB9] uppercase tracking-wide">{b}</span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
          <svg className="flex-shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24"
            stroke="#EF4444" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[13px] text-red-600">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={paying}
        disabled={!stripe || !clientSecret}
      >
        {paying ? 'Processing…' : `Pay ${formatMoney(total)}`}
      </Button>

      <p className="text-center text-[11px] text-[#C4BFB9]">
        By paying, you agree to Style.re's{' '}
        <span className="text-[#78716C] underline underline-offset-2 cursor-pointer">Terms of Service</span>
      </p>
    </form>
  );
};

export const Payment: React.FC = () => {
  return (
    <AppShell title="Secure Payment" showBack showNav={false} step={3} totalSteps={4}>
      <Elements stripe={stripePromise}>
        <PaymentForm />
      </Elements>
    </AppShell>
  );
};
