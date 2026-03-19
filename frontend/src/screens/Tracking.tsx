import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Card, statusBadge } from '../components/ui';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import type { OrderStatus, TrackingEvent } from '../types';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Order Placed',
  confirmed: 'Order Confirmed',
  assigned: 'Courier Assigned',
  picked_up: 'Items Picked Up',
  in_transit: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Delivery Failed',
};

const STATUS_ICONS: Record<OrderStatus, React.ReactNode> = {
  pending: '📋',
  confirmed: '✅',
  assigned: '🧑‍💼',
  picked_up: '📦',
  in_transit: '🚗',
  delivered: '🎉',
  cancelled: '❌',
  failed: '⚠️',
};

const STATUS_ORDER: OrderStatus[] = [
  'pending', 'confirmed', 'assigned', 'picked_up', 'in_transit', 'delivered',
];

// Mock tracking data for demo/offline
const getMockTracking = (orderId: string) => ({
  orderId,
  status: 'in_transit' as OrderStatus,
  driverName: 'Style.re Courier',
  estimatedMinutes: 12,
  timeline: [
    { status: 'pending' as OrderStatus, timestamp: new Date(Date.now() - 25 * 60000).toISOString(), description: 'Order placed and confirmed' },
    { status: 'confirmed' as OrderStatus, timestamp: new Date(Date.now() - 20 * 60000).toISOString(), description: 'Payment verified' },
    { status: 'assigned' as OrderStatus, timestamp: new Date(Date.now() - 15 * 60000).toISOString(), description: 'Style.re courier assigned' },
    { status: 'picked_up' as OrderStatus, timestamp: new Date(Date.now() - 8 * 60000).toISOString(), description: 'Items picked up from store' },
    { status: 'in_transit' as OrderStatus, timestamp: new Date(Date.now() - 2 * 60000).toISOString(), description: 'Out for delivery' },
  ],
});

export const Tracking: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [useMock, setUseMock] = useState(false);

  const { data: tracking, isLoading, error } = useQuery({
    queryKey: ['tracking', orderId],
    queryFn: () => api.getTracking(orderId!),
    refetchInterval: 15000,
    retry: 1,
    enabled: !!orderId && !useMock,
  });

  useEffect(() => {
    if (error) setUseMock(true);
  }, [error]);

  const data = useMock ? getMockTracking(orderId ?? 'ORDER') : tracking;

  const currentStatusIndex = STATUS_ORDER.indexOf(data?.status as OrderStatus);

  return (
    <AppShell title="Live Tracking" showBack showNav={false}>
      <div className="px-5 py-6 flex flex-col gap-5">
        {isLoading && !useMock ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : data ? (
          <>
            {/* Status Hero */}
            <Card className="bg-gradient-to-br from-[#F97316] to-[#EA6B0E] border-0 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-xs uppercase tracking-wide">Current Status</p>
                  <p className="text-xl font-bold mt-1">
                    {STATUS_ICONS[data.status]} {STATUS_LABELS[data.status]}
                  </p>
                  {data.estimatedMinutes && data.status !== 'delivered' && (
                    <p className="text-white/80 text-sm mt-1">
                      ~{data.estimatedMinutes} min remaining
                    </p>
                  )}
                </div>
                <div>{statusBadge(data.status)}</div>
              </div>
            </Card>

            {/* Driver Info */}
            {data.driverName && data.status !== 'delivered' && data.status !== 'cancelled' && (
              <Card>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#FED7AA]/40 flex items-center justify-center text-2xl">
                    🧑‍💼
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-[#78716C] uppercase tracking-wide">Your Courier</p>
                    <p className="font-semibold text-[#1C1917]">{data.driverName}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/chat/${orderId}`)}
                    className="w-10 h-10 rounded-full bg-[#F97316] flex items-center justify-center text-white"
                  >
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>
                </div>
              </Card>
            )}

            {/* Map placeholder */}
            <Card padding="none" className="overflow-hidden">
              <div className="bg-gradient-to-br from-[#FAFAF9] to-[#FED7AA]/20 h-48 flex flex-col items-center justify-center gap-3 border-b border-[#E7E5E4]">
                <div className="w-14 h-14 rounded-full bg-[#F97316]/10 flex items-center justify-center">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#F97316" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <circle cx="12" cy="11" r="3" />
                  </svg>
                </div>
                <p className="text-sm text-[#78716C] font-medium">Live map — courier in motion</p>
                {data.status === 'in_transit' && (
                  <div className="flex items-center gap-1.5 text-xs text-[#F97316] font-medium">
                    <div className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
                    Style.re courier is on the way
                  </div>
                )}
              </div>
            </Card>

            {/* Progress Bar */}
            <Card>
              <h2 className="font-semibold text-[#1C1917] mb-4">Delivery Progress</h2>
              <div className="flex items-center gap-1">
                {STATUS_ORDER.filter(s => s !== 'cancelled' && s !== 'failed').map((status, i) => {
                  const isComplete = i <= currentStatusIndex;
                  const isCurrent = i === currentStatusIndex;
                  return (
                    <React.Fragment key={status}>
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all ${
                          isComplete
                            ? 'bg-[#F97316] text-white'
                            : 'bg-[#E7E5E4] text-[#A8A29E]'
                        } ${isCurrent ? 'ring-2 ring-[#F97316] ring-offset-2' : ''}`}
                      >
                        {STATUS_ICONS[status]}
                      </div>
                      {i < STATUS_ORDER.filter(s => s !== 'cancelled' && s !== 'failed').length - 1 && (
                        <div className={`flex-1 h-1 rounded-full ${i < currentStatusIndex ? 'bg-[#F97316]' : 'bg-[#E7E5E4]'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </Card>

            {/* Timeline */}
            <Card>
              <h2 className="font-semibold text-[#1C1917] mb-4">Timeline</h2>
              <div className="flex flex-col gap-4">
                {[...data.timeline].reverse().map((event: TrackingEvent, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-1 w-2 h-2 rounded-full bg-[#F97316] flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[#1C1917]">
                          {STATUS_LABELS[event.status]}
                        </p>
                        <p className="text-xs text-[#78716C] whitespace-nowrap">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <p className="text-xs text-[#78716C]">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Chat CTA */}
            <button
              onClick={() => navigate(`/chat/${orderId}`)}
              className="flex items-center gap-3 p-4 bg-white border border-[#E7E5E4] rounded-2xl hover:border-[#F97316]/40 transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-[#FED7AA]/40 flex items-center justify-center">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#F97316" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-[#1C1917] text-sm">Chat with courier</p>
                <p className="text-xs text-[#78716C]">Send a message to your Style.re courier</p>
              </div>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#78716C" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        ) : (
          <Card>
            <p className="text-center text-[#78716C] text-sm py-8">
              Tracking information unavailable for this order.
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
};
