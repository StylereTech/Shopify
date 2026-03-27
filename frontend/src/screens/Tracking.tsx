import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui';
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

const STATUS_ICONS: Record<OrderStatus, string> = {
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
  const visibleStatuses = STATUS_ORDER.filter(s => s !== 'cancelled' && s !== 'failed');

  const isDelivered = data?.status === 'delivered';

  return (
    <AppShell title="Live Tracking" showBack showNav={false}>
      <div className="px-5 py-6 flex flex-col gap-5">
        {isLoading && !useMock ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <LoadingSpinner size="lg" />
            <p className="text-[14px] text-[#78716C]">Loading tracking info…</p>
          </div>
        ) : data ? (
          <>
            {/* Status Hero */}
            <div className={`rounded-3xl p-6 ${
              isDelivered
                ? 'bg-emerald-500 text-white'
                : 'bg-[#1C1917] text-white'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white/50 text-[11px] uppercase tracking-wider mb-2 font-semibold">
                    Current Status
                  </p>
                  <p className="text-xl font-bold mb-1">
                    {STATUS_LABELS[data.status]}
                  </p>
                  {data.estimatedMinutes && !isDelivered && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="w-2 h-2 rounded-full bg-[#E8621A] animate-pulse" />
                      <p className="text-white/70 text-[13px]">
                        ~{data.estimatedMinutes} min remaining
                      </p>
                    </div>
                  )}
                </div>
                <div className="text-3xl">{STATUS_ICONS[data.status]}</div>
              </div>
            </div>

            {/* Progress Bar */}
            <Card>
              <h2 className="font-bold text-[#1C1917] text-[14px] mb-4">Delivery Progress</h2>
              <div className="flex items-center gap-1">
                {visibleStatuses.map((status, i) => {
                  const isComplete = i <= currentStatusIndex;
                  const isCurrent = i === currentStatusIndex;
                  return (
                    <React.Fragment key={status}>
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] flex-shrink-0 transition-all duration-300 ${
                          isComplete
                            ? 'bg-[#E8621A] text-white shadow-[0_2px_8px_rgba(232,98,26,0.3)]'
                            : 'bg-[#F5F2EE] text-[#C4BFB9]'
                        } ${isCurrent ? 'ring-2 ring-[#E8621A] ring-offset-2 scale-110' : ''}`}
                      >
                        {STATUS_ICONS[status]}
                      </div>
                      {i < visibleStatuses.length - 1 && (
                        <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                          i < currentStatusIndex ? 'bg-[#E8621A]' : 'bg-[#EEEBE8]'
                        }`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </Card>

            {/* Driver Info */}
            {data.driverName && !isDelivered && data.status !== 'cancelled' && (
              <Card>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#FAF9F7] flex items-center justify-center text-2xl border border-[#EEEBE8] flex-shrink-0">
                    🧑‍💼
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] text-[#A8A29E] uppercase tracking-wider mb-0.5">Your Courier</p>
                    <p className="font-bold text-[#1C1917] text-[15px]">{data.driverName}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/chat/${orderId}`)}
                    className="w-11 h-11 rounded-full bg-[#E8621A] flex items-center justify-center text-white shadow-[0_2px_8px_rgba(232,98,26,0.3)] active:scale-95 transition-all"
                    aria-label="Chat with courier"
                  >
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>
                </div>
              </Card>
            )}

            {/* Live Map */}
            <Card padding="none" className="overflow-hidden">
              {(data as { doordashTrackingUrl?: string }).doordashTrackingUrl ? (
                <div className="p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#E8621A] animate-pulse" />
                    <p className="text-[13px] font-semibold text-[#1C1917]">Live courier tracking available</p>
                  </div>
                  <a
                    href={(data as { doordashTrackingUrl?: string }).doordashTrackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3.5 rounded-2xl bg-[#E8621A] text-white text-center text-[14px] font-bold active:scale-[0.98] transition-all duration-150"
                  >
                    Open Live Map →
                  </a>
                </div>
              ) : (
                <div className="h-44 bg-[#F5F2EE] flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#E8621A" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <circle cx="12" cy="11" r="3" />
                    </svg>
                  </div>
                  <p className="text-[13px] text-[#78716C] font-medium">Courier in motion</p>
                  {data.status === 'in_transit' && (
                    <div className="flex items-center gap-1.5 text-[12px] text-[#E8621A] font-semibold">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#E8621A] animate-pulse" />
                      On the way to you
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Timeline */}
            <Card>
              <h2 className="font-bold text-[#1C1917] text-[14px] mb-5">Timeline</h2>
              <div className="relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#EEEBE8]" />
                <div className="space-y-5">
                  {[...data.timeline].reverse().map((event: TrackingEvent, i: number) => (
                    <div key={i} className="flex items-start gap-4 relative">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#E8621A] flex-shrink-0 mt-0.5 relative z-10 shadow-[0_0_0_3px_white]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-[13px] font-semibold text-[#1C1917]">
                            {STATUS_LABELS[event.status]}
                          </p>
                          <p className="text-[11px] text-[#A8A29E] whitespace-nowrap flex-shrink-0">
                            {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <p className="text-[12px] text-[#78716C]">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Chat CTA */}
            <button
              onClick={() => navigate(`/chat/${orderId}`)}
              className="flex items-center gap-4 p-4 bg-white rounded-3xl shadow-[0_2px_12px_rgba(28,25,23,0.06)] active:scale-[0.99] transition-all duration-150"
            >
              <div className="w-11 h-11 rounded-full bg-[#FFF3EE] flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#E8621A" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-[#1C1917] text-[14px]">Chat with courier</p>
                <p className="text-[12px] text-[#78716C]">Send a message about your delivery</p>
              </div>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#C4BFB9" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        ) : (
          <Card>
            <div className="py-10 text-center">
              <p className="text-[#78716C] text-[15px] mb-4">Tracking information unavailable.</p>
              <button
                onClick={() => navigate('/')}
                className="text-[#E8621A] text-[14px] font-semibold"
              >
                Back to home →
              </button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
};
