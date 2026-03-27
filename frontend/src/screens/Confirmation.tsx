import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card } from '../components/ui';

export const Confirmation: React.FC = () => {
  const navigate = useNavigate();
  const { currentOrder, draft } = useOrderStore();

  const orderId = currentOrder?.id ?? draft.orderId ?? 'SR-' + Date.now().toString(36).toUpperCase();
  const eta = draft.pricing?.estimatedMinutes ?? 45;

  return (
    <AppShell showNav={false} step={4} totalSteps={4}>
      <div className="px-5 py-8 flex flex-col items-center gap-6">

        {/* Celebration mark */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center shadow-[0_8px_32px_rgba(34,197,94,0.15)]">
            <svg width="44" height="44" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          {/* Decorative dots */}
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E8621A] opacity-60" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full bg-[#E8621A] opacity-40" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#1C1917] tracking-tight mb-2">Order confirmed!</h1>
          <p className="text-[#78716C] text-[15px] leading-relaxed">
            Your courier is being dispatched now.
          </p>
        </div>

        {/* Order ID */}
        <Card className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-[#A8A29E] uppercase tracking-widest font-semibold mb-1">Order ID</p>
              <p className="text-lg font-bold text-[#1C1917] font-mono tracking-wide">{orderId}</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl px-3 py-1.5">
              <p className="text-emerald-700 text-[12px] font-bold">Confirmed</p>
            </div>
          </div>
        </Card>

        {/* ETA */}
        <Card className="w-full">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF3EE] flex items-center justify-center flex-shrink-0">
              <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#E8621A" strokeWidth={1.75}>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <p className="text-[13px] text-[#78716C] mb-0.5">Estimated delivery</p>
              <p className="text-2xl font-bold text-[#1C1917]">{eta} min</p>
            </div>
          </div>
        </Card>

        {/* What happens next */}
        <Card className="w-full">
          <h2 className="font-bold text-[#1C1917] text-[15px] mb-5">What happens next</h2>
          <div className="space-y-4">
            {[
              { title: 'Courier assigned', desc: 'A Style.re courier is on their way to the store' },
              { title: 'Items picked up', desc: 'Your courier collects the items' },
              { title: 'Out for delivery', desc: 'Items are headed to your address' },
              { title: 'Delivered', desc: 'You receive a confirmation notification' },
            ].map(({ title, desc }, i) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#E8621A] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-[#1C1917] text-[14px]">{title}</p>
                  <p className="text-[12px] text-[#78716C] mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* CTAs */}
        <div className="w-full flex flex-col gap-3">
          <Button
            fullWidth
            size="lg"
            onClick={() => navigate(`/tracking/${orderId}`)}
          >
            Track My Order →
          </Button>
          {currentOrder?.doordashTrackingUrl && (
            <a
              href={currentOrder.doordashTrackingUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full py-4 rounded-2xl text-center text-[15px] font-bold bg-[#E8621A] text-white active:scale-[0.98] transition-all duration-150 min-h-[52px] flex items-center justify-center"
            >
              Open Live Map →
            </a>
          )}
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={() => navigate('/')}
          >
            New Order
          </Button>
        </div>

        <p className="text-[11px] text-[#C4BFB9] text-center pb-2">
          Check your email for order details
        </p>
      </div>
    </AppShell>
  );
};
