import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card } from '../components/ui';
import type { PricingQuote } from '../types';

const formatAddress = (addr: Partial<{ street: string; city: string; state: string; zip: string; unit?: string }>) =>
  [addr.street, addr.unit, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');

const formatMoney = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents);

export const OrderSummary: React.FC = () => {
  const navigate = useNavigate();
  const { draft, setPricing } = useOrderStore();
  const [quote, setQuote] = useState<PricingQuote | null>(draft.pricing ?? null);
  const [loading, setLoading] = useState(!draft.pricing);

  useEffect(() => {
    if (draft.pricing) return;
    api.getQuote(draft).then((q) => {
      setQuote(q);
      setPricing(q);
      setLoading(false);
    });
  }, []);

  if (!draft.serviceType || !draft.pickupAddress || !draft.dropoffAddress) {
    navigate('/');
    return null;
  }

  return (
    <AppShell title="Order Summary" showBack showNav={false}>
      <div className="px-5 py-6 flex flex-col gap-5">

        {/* Service Type */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#78716C]">Service</span>
            <span className="font-semibold text-[#1C1917]">
              {draft.serviceType === 'logo_pickup' ? 'Logo Pickup' : 'Item Delivery'}
            </span>
          </div>
        </Card>

        {/* Route */}
        <Card>
          <h2 className="font-semibold text-[#1C1917] mb-4">Route</h2>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 w-5 h-5 rounded-full bg-[#F97316] flex-shrink-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
              <div>
                <p className="text-xs text-[#78716C] uppercase tracking-wide font-medium">Pickup</p>
                <p className="text-sm text-[#1C1917] font-medium">
                  {formatAddress(draft.pickupAddress)}
                </p>
              </div>
            </div>

            <div className="ml-2.5 border-l-2 border-dashed border-[#E7E5E4] h-4" />

            <div className="flex items-start gap-3">
              <div className="mt-1 w-5 h-5 rounded-full bg-[#1C1917] flex-shrink-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
              <div>
                <p className="text-xs text-[#78716C] uppercase tracking-wide font-medium">Drop-off</p>
                <p className="text-sm text-[#1C1917] font-medium">
                  {formatAddress(draft.dropoffAddress)}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Contact */}
        <Card>
          <h2 className="font-semibold text-[#1C1917] mb-3">Contact</h2>
          <div className="flex flex-col gap-1 text-sm text-[#78716C]">
            <p>{draft.contact?.name}</p>
            <p>{draft.contact?.phone}</p>
            <p>{draft.contact?.email}</p>
          </div>
        </Card>

        {/* Notes */}
        {draft.notes && (
          <Card>
            <h2 className="font-semibold text-[#1C1917] mb-2">Notes</h2>
            <p className="text-sm text-[#78716C]">{draft.notes}</p>
          </Card>
        )}

        {/* Pricing */}
        <Card>
          <h2 className="font-semibold text-[#1C1917] mb-4">Price Breakdown</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[#78716C]">
              <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
              Calculating price...
            </div>
          ) : quote ? (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-[#78716C]">
                <span>Delivery Fee</span>
                <span>{formatMoney(quote.deliveryFee)}</span>
              </div>
              <div className="flex justify-between text-[#78716C]">
                <span>Service Fee</span>
                <span>{formatMoney(quote.serviceFee)}</span>
              </div>
              <div className="flex justify-between text-[#78716C]">
                <span>Tax</span>
                <span>{formatMoney(quote.tax)}</span>
              </div>
              <div className="border-t border-[#E7E5E4] mt-1 pt-2 flex justify-between font-bold text-[#1C1917] text-base">
                <span>Total</span>
                <span className="text-[#F97316]">{formatMoney(quote.total)}</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-[#78716C] bg-[#FAFAF9] rounded-lg p-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" d="M12 8v4l3 3" />
                </svg>
                Estimated delivery: {quote.estimatedMinutes} minutes
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-500">Failed to load pricing</p>
          )}
        </Card>

        <Button size="lg" fullWidth onClick={() => navigate('/payment')} disabled={loading}>
          Proceed to Payment →
        </Button>

        <p className="text-center text-xs text-[#78716C] pb-4">
          Secure payment powered by Style.re
        </p>
      </div>
    </AppShell>
  );
};
