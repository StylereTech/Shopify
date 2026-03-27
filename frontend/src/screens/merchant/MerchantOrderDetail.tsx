import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { merchantApi } from '../../api/merchantApi';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  assigned: '#3b82f6',
  picked_up: '#8b5cf6',
  en_route: '#06b6d4',
  delivered: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Driver Assigned',
  picked_up: 'Picked Up',
  en_route: 'En Route',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

interface Order {
  id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  delivery_address: string;
  status: string;
  total_amount_cents: number;
  items?: unknown;
  created_at: string;
  updated_at: string;
}

interface TrackingEvent {
  id: string;
  status: string;
  attempted_at?: string;
  attempt_status?: string;
}

export const MerchantOrderDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    merchantApi
      .orderDetail(id)
      .then((data) => {
        // API may return the order directly or wrapped in {order, tracking}
        const orderData = (data as any).order ?? data;
        const trackingData = (data as any).tracking ?? [];
        setOrder(orderData as Order);
        setTracking(trackingData);
        setLoading(false);
      })
      .catch((err) => {
        if (err.message === 'unauthorized') { navigate('/merchant/login'); return; }
        setError('Failed to load order');
        setLoading(false);
      });
  }, [id, navigate]);

  const statusColor = order ? (STATUS_COLORS[order.status] || '#6b7280') : '#6b7280';
  const items = order?.items as Array<{ name: string; quantity: number; sku?: string }> | null;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontFamily: 'system-ui, sans-serif' }}>
        Loading order...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5', fontFamily: 'system-ui, sans-serif' }}>
        {error || 'Order not found'}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ padding: '16px 24px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={() => navigate('/merchant/dashboard')}
          style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#a1a1aa', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Order Detail</h1>
      </header>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {/* Status Badge */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}`, padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
            {STATUS_LABELS[order.status] || order.status}
          </span>
          <span style={{ color: '#52525b', fontSize: 13 }}>ID: {order.id.slice(0, 8)}...</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Customer Info */}
          <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', color: '#a1a1aa', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Customer</h3>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{order.customer_name}</p>
            {order.customer_phone && <p style={{ margin: '0 0 8px', color: '#a1a1aa', fontSize: 14 }}>📞 {order.customer_phone}</p>}
            {order.customer_email && <p style={{ margin: 0, color: '#a1a1aa', fontSize: 14 }}>✉️ {order.customer_email}</p>}
          </div>

          {/* Delivery Info */}
          <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', color: '#a1a1aa', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Delivery</h3>
            <p style={{ margin: '0 0 8px', fontSize: 14 }}>📍 {order.delivery_address}</p>
            <p style={{ margin: '0 0 8px', color: '#a1a1aa', fontSize: 13 }}>
              Total: ${(order.total_amount_cents / 100).toFixed(2)}
            </p>
            <p style={{ margin: 0, color: '#52525b', fontSize: 12 }}>
              {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Items */}
        {items && items.length > 0 && (
          <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 12, padding: 20, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 16px', color: '#a1a1aa', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Items</h3>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid #27272a' : 'none' }}>
                <span style={{ fontSize: 14 }}>{item.name}</span>
                <span style={{ color: '#71717a', fontSize: 14 }}>×{item.quantity}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tracking Timeline */}
        {tracking.length > 0 && (
          <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 12, padding: 20, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 16px', color: '#a1a1aa', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Tracking History</h3>
            {tracking.map((event, i) => (
              <div key={event.id || i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[event.attempt_status || ''] || '#3f3f46', marginTop: 4, flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{STATUS_LABELS[event.attempt_status || ''] || event.attempt_status}</p>
                  {event.attempted_at && (
                    <p style={{ margin: 0, color: '#52525b', fontSize: 12 }}>{new Date(event.attempted_at).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MerchantOrderDetail;
