import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { Card } from '../components/ui';
import type { ServiceType } from '../types';

interface ServiceOption {
  type: ServiceType;
  title: string;
  description: string;
  icon: React.ReactNode;
  eta: string;
}

const services: ServiceOption[] = [
  {
    type: 'logo_pickup',
    title: 'Logo Pickup',
    description: 'We pick up branded items, accessories, or merchandise from a store and bring them to you.',
    icon: (
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#F97316" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
    eta: '30–45 min',
  },
  {
    type: 'item_delivery',
    title: 'Item Delivery',
    description: "Send clothing, accessories, or fashion items from any store directly to a customer's door.",
    icon: (
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#F97316" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
        <line strokeLinecap="round" x1="12" y1="12" x2="12" y2="16" />
        <line strokeLinecap="round" x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
    eta: '45–60 min',
  },
];

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { draft, setServiceType } = useOrderStore();

  const handleSelect = (type: ServiceType) => {
    setServiceType(type);
    navigate('/address');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAF9]">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#F97316] to-[#EA6B0E] text-white px-6 pt-12 pb-16">
        <div className="mb-2">
          <span className="text-3xl font-bold tracking-tight">Style.re</span>
        </div>
        <h1 className="text-2xl font-bold leading-snug mt-4 mb-2">
          Fashion, delivered to you.
        </h1>
        <p className="text-white/80 text-sm leading-relaxed">
          Same-day delivery from your favorite stores. Select a service to get started.
        </p>
      </div>

      {/* Service Selection */}
      <div className="px-5 -mt-8 flex flex-col gap-4 flex-1">
        {services.map((svc) => (
          <Card
            key={svc.type}
            hoverable
            selected={draft.serviceType === svc.type}
            onClick={() => handleSelect(svc.type)}
            className="relative overflow-hidden"
          >
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#FED7AA]/40 flex items-center justify-center flex-shrink-0">
                {svc.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-[#1C1917] text-lg">{svc.title}</h2>
                  <span className="text-xs font-medium text-[#F97316] bg-[#FED7AA]/50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {svc.eta}
                  </span>
                </div>
                <p className="text-sm text-[#78716C] mt-1 leading-relaxed">
                  {svc.description}
                </p>
                <div className="mt-3 flex items-center text-[#F97316] text-sm font-semibold gap-1">
                  Select
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {/* Trust Indicators */}
        <div className="mt-4 mb-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '⚡', label: 'Fast Delivery' },
            { icon: '🔒', label: 'Secure Payment' },
            { icon: '📍', label: 'Live Tracking' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-[#78716C]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
