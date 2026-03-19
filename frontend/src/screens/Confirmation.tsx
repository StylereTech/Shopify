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
    <AppShell showNav={false}>
      <div className="px-5 py-10 flex flex-col items-center gap-6">
        {/* Success mark */}
        <div className="w-20 h-20 rounded-full bg-green-50 border-4 border-green-200 flex items-center justify-center">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#1C1917]">Order Confirmed!</h1>
          <p className="text-[#78716C] mt-2 text-sm">
            Your Style.re delivery is on its way.
          </p>
        </div>

        {/* Order ID */}
        <Card className="w-full">
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="text-xs text-[#78716C] uppercase tracking-widest font-medium">Order ID</p>
            <p className="text-xl font-bold text-[#F97316] font-mono tracking-wide">{orderId}</p>
          </div>
        </Card>

        {/* ETA */}
        <Card className="w-full">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FED7AA]/40 flex items-center justify-center">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#F97316" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[#78716C]">Estimated Delivery</p>
              <p className="font-bold text-[#1C1917] text-lg">{eta} minutes</p>
            </div>
          </div>
        </Card>

        {/* Next steps */}
        <Card className="w-full">
          <h2 className="font-semibold text-[#1C1917] mb-4">What happens next</h2>
          <div className="flex flex-col gap-4">
            {[
              { step: '1', title: 'Driver assigned', desc: 'A Style.re courier is being assigned to your order' },
              { step: '2', title: 'Items picked up', desc: 'Your courier picks up your items from the store' },
              { step: '3', title: 'Out for delivery', desc: 'Items are on their way to your address' },
              { step: '4', title: 'Delivered', desc: 'You receive a delivery confirmation' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#F97316] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step}
                </div>
                <div>
                  <p className="font-medium text-[#1C1917] text-sm">{title}</p>
                  <p className="text-xs text-[#78716C]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* CTA buttons */}
        <div className="w-full flex flex-col gap-3">
          <Button
            fullWidth
            size="lg"
            onClick={() => navigate(`/tracking/${orderId}`)}
          >
            Track My Order
          </Button>
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={() => navigate('/')}
          >
            New Order
          </Button>
        </div>
      </div>
    </AppShell>
  );
};
