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
      '::placeholder': { color: '#A8A29E' },
      iconColor: '#F97316',
    },
    invalid: { color: '#EF4444', iconColor: '#EF4444' },
  },
};

const PaymentForm: React.FC = () => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { draft, setOrderId, setPaymentIntentId, setCurrentOrder } = useOrderStore();

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
    // 1. Create order on backend
    // 2. Get payment intent
    const initialize = async () => {
      try {
        // Create order
        let orderId = draft.orderId;
        if (!orderId) {
          const order = await api.createOrder(draft);
          orderId = order.id;
          setOrderId(orderId);
          setCurrentOrder(order);
        }

        // Get payment intent
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
        // Confirm on backend
        await api.confirmPayment(paymentIntentId, draft.orderId!);
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
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#78716C]">Preparing secure payment…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-[#1C1917]">Payment successful!</p>
        <p className="text-sm text-[#78716C]">Redirecting…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handlePay} className="px-5 py-6 flex flex-col gap-5">
      {/* Order total */}
      <Card className="bg-[#FED7AA]/20 border-[#F97316]/30">
        <div className="flex items-center justify-between">
          <span className="text-[#78716C] text-sm">Total to pay</span>
          <span className="text-2xl font-bold text-[#F97316]">{formatMoney(total)}</span>
        </div>
      </Card>

      {/* Card Input */}
      <Card>
        <h2 className="font-semibold text-[#1C1917] mb-4">Card Details</h2>
        <div className="border border-[#E7E5E4] rounded-xl p-4 focus-within:ring-2 focus-within:ring-[#F97316] focus-within:border-transparent transition-all">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#78716C]">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          Encrypted & secure via Stripe
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <svg className="flex-shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24"
            stroke="#EF4444" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-red-600">{error}</p>
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

      <p className="text-center text-xs text-[#78716C] pb-2">
        By paying, you agree to Style.re's Terms of Service
      </p>
    </form>
  );
};

export const Payment: React.FC = () => {
  return (
    <AppShell title="Payment" showBack showNav={false}>
      <Elements stripe={stripePromise}>
        <PaymentForm />
      </Elements>
    </AppShell>
  );
};
