import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Card, statusBadge, Button } from '../components/ui';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import type { Order } from '../types';

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

// Mock data for demo
const mockOrders: Order[] = [
  {
    id: 'SR-ABC123',
    serviceType: 'item_delivery',
    status: 'delivered',
    pickupAddress: { street: '100 NorthPark Center', city: 'Dallas', state: 'TX', zip: '75225', country: 'US' },
    dropoffAddress: { street: '456 Cedar Springs Rd', city: 'Dallas', state: 'TX', zip: '75201', country: 'US' },
    items: [{ name: 'Summer Dress', quantity: 1 }],
    contact: { name: 'Jane Smith', phone: '+12145550100', email: 'jane@example.com' },
    pricing: { subtotal: 0, deliveryFee: 7.99, serviceFee: 1.99, tax: 0.80, total: 10.78, estimatedMinutes: 45 },
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60000 + 45 * 60000).toISOString(),
  },
  {
    id: 'SR-DEF456',
    serviceType: 'logo_pickup',
    status: 'in_transit',
    pickupAddress: { street: '2403 Stemmons Fwy', city: 'Dallas', state: 'TX', zip: '75207', country: 'US' },
    dropoffAddress: { street: '789 Oak Cliff Blvd', city: 'Dallas', state: 'TX', zip: '75203', country: 'US' },
    items: [{ name: 'Logo Bag', quantity: 2 }],
    contact: { name: 'Jane Smith', phone: '+12145550100', email: 'jane@example.com' },
    pricing: { subtotal: 0, deliveryFee: 9.99, serviceFee: 1.99, tax: 0.96, total: 12.94, estimatedMinutes: 20 },
    createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
  },
];

const OrderCard: React.FC<{ order: Order; onClick: () => void }> = ({ order, onClick }) => {
  const isActive = !['delivered', 'cancelled', 'failed'].includes(order.status);

  return (
    <Card hoverable onClick={onClick} className="relative">
      {isActive && (
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
            <span className="text-xs font-medium text-[#F97316]">Live</span>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <div>
            <p className="font-mono text-sm font-semibold text-[#F97316]">{order.id}</p>
            <p className="text-xs text-[#78716C] mt-0.5">{formatDate(order.createdAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusBadge(order.status)}
          <span className="text-xs text-[#78716C]">
            {order.serviceType === 'logo_pickup' ? '👜 Logo Pickup' : '📦 Item Delivery'}
          </span>
        </div>

        <div className="bg-[#FAFAF9] rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-[#78716C]">
            <div className="w-2 h-2 rounded-full bg-[#F97316]" />
            <span className="truncate">{order.pickupAddress.street}, {order.pickupAddress.city}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#78716C]">
            <div className="w-2 h-2 rounded-full bg-[#1C1917]" />
            <span className="truncate">{order.dropoffAddress.street}, {order.dropoffAddress.city}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-bold text-[#1C1917]">{formatMoney(order.pricing.total)}</span>
          <div className="flex items-center gap-1 text-[#F97316] text-xs font-medium">
            {isActive ? 'Track order' : 'View details'}
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Card>
  );
};

export const OrderHistory: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [useMock, setUseMock] = useState(false);

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['active-orders'],
    queryFn: () => api.getActiveOrders(),
    retry: 1,
    enabled: !useMock,
  });

  React.useEffect(() => {
    if (error) setUseMock(true);
  }, [error]);

  const allOrders = useMock ? mockOrders : (orders ?? []);

  const filtered = allOrders.filter((o) => {
    if (filter === 'active') return !['delivered', 'cancelled', 'failed'].includes(o.status);
    if (filter === 'completed') return ['delivered', 'cancelled', 'failed'].includes(o.status);
    return true;
  });

  return (
    <AppShell title="My Orders" showNav>
      <div className="px-5 py-5 flex flex-col gap-5">
        {/* Filter tabs */}
        <div className="flex bg-[#F4F4F3] rounded-xl p-1 gap-1">
          {(['all', 'active', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                filter === tab
                  ? 'bg-white text-[#1C1917] shadow-sm'
                  : 'text-[#78716C] hover:text-[#1C1917]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Orders list */}
        {isLoading && !useMock ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="text-5xl">📦</div>
            <div>
              <p className="font-semibold text-[#1C1917]">No orders yet</p>
              <p className="text-sm text-[#78716C] mt-1">
                {filter === 'active' ? 'No active orders right now' : 'Your delivery history will appear here'}
              </p>
            </div>
            <Button onClick={() => navigate('/')}>Place Your First Order</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onClick={() => {
                  const isActive = !['delivered', 'cancelled', 'failed'].includes(order.status);
                  navigate(isActive ? `/tracking/${order.id}` : `/order/${order.id}`);
                }}
              />
            ))}
          </div>
        )}

        {/* New Order CTA */}
        <Button fullWidth size="lg" onClick={() => navigate('/')} variant="secondary">
          + New Order
        </Button>
      </div>
    </AppShell>
  );
};
