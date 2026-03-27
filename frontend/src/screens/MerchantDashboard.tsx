import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_SHOPIFY_API_URL || 'https://api-production-653e.up.railway.app';

// ── Types ──────────────────────────────────────────────────────────────────

interface MerchantInfo {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  store_name: string;
  plan: string;
  plan_status: string;
}

interface DashboardStats {
  active: number;
  pending: number;
  completed_today: number;
  failed: number;
  total: number;
}

interface Order {
  id: string;
  customer_name: string;
  customer_phone?: string;
  delivery_address?: string;
  status: string;
  total_amount_cents: number;
  created_at: string;
}

interface Invoice {
  id: string;
  stripe_invoice_id?: string;
  amount_cents: number;
  status: string;
  period_start?: string;
  period_end?: string;
  created_at: string;
}

interface StaffMember {
  id: string;
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  assigned: '#3b82f6',
  picked_up: '#8b5cf6',
  en_route: '#06b6d4',
  delivered: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280',
  active: '#22c55e',
  past_due: '#ef4444',
};

const TABS = ['overview', 'orders', 'tracking', 'settings', 'billing', 'team'] as const;
type Tab = typeof TABS[number];

// ── Main Component ────────────────────────────────────────────────────────────

export const MerchantDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [createOrderForm, setCreateOrderForm] = useState({ customer_name: '', customer_phone: '', delivery_address: '', total_amount_cents: '' });
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const token = localStorage.getItem('merchant_token');

  const apiFetch = useCallback(
    async (path: string, options?: RequestInit) => {
      const res = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options?.headers || {}),
        },
      });
      if (res.status === 401) {
        localStorage.removeItem('merchant_token');
        localStorage.removeItem('merchant_info');
        navigate('/merchant/login');
        throw new Error('unauthorized');
      }
      return res;
    },
    [token, navigate]
  );

  // Load dashboard on mount
  useEffect(() => {
    if (!token) { navigate('/merchant/login'); return; }

    const load = async () => {
      try {
        const [dashRes, meRes] = await Promise.all([
          apiFetch('/api/merchant/dashboard'),
          apiFetch('/api/merchant/auth/me'),
        ]);

        if (dashRes.ok) {
          const d = await dashRes.json();
          setStats(d.stats);
          setRecentOrders(d.recent_orders || []);
          setMerchant(d.merchant);
        }
        if (meRes.ok) {
          const m = await meRes.json();
          setMerchant(m);
          setSettings({
            store_name: m.store_name || '',
            store_address: m.store_address || '',
            store_phone: m.store_phone || '',
            city: m.city || '',
            state: m.state || '',
            zip: m.zip || '',
            first_name: m.first_name || '',
            last_name: m.last_name || '',
          });
        }
      } catch {
        // handled above
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, navigate, apiFetch]);

  // Load tab-specific data
  useEffect(() => {
    if (!token || loading) return;

    if (tab === 'orders') {
      apiFetch(`/api/merchant/orders?page=${orderPage}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}`)
        .then((r) => r.json())
        .then((d) => { setOrders(d.orders || []); setOrderTotal(d.pagination?.total || 0); })
        .catch(() => {});
    }

    if (tab === 'billing') {
      apiFetch('/api/merchant/billing')
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setInvoices(d.invoices || []); })
        .catch(() => {});
    }

    if (tab === 'team' && merchant?.plan === 'growth') {
      apiFetch('/api/merchant/team')
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setStaff(d.staff || []); })
        .catch(() => {});
    }
  }, [tab, orderPage, statusFilter, loading, token, merchant?.plan, apiFetch]);

  const handleLogout = async () => {
    await apiFetch('/api/merchant/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('merchant_token');
    localStorage.removeItem('merchant_info');
    navigate('/merchant/login');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/merchant/settings', { method: 'PUT', body: JSON.stringify(settings) });
      if (res.ok) setActionMsg('Settings saved!');
      else setActionMsg('Failed to save settings');
    } catch { setActionMsg('Error saving settings'); }
    setSavingSettings(false);
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      const res = await apiFetch('/api/merchant/team', { method: 'POST', body: JSON.stringify({ email: inviteEmail }) });
      if (res.ok) {
        const d = await res.json();
        setStaff((s) => [...s, d.staff_member]);
        setInviteEmail('');
        setActionMsg('Staff member invited!');
      }
    } catch { setActionMsg('Error inviting staff'); }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/merchant/orders', {
        method: 'POST',
        body: JSON.stringify({ ...createOrderForm, total_amount_cents: parseInt(createOrderForm.total_amount_cents || '0') }),
      });
      if (res.ok) {
        setActionMsg('Order created!');
        setCreateOrderForm({ customer_name: '', customer_phone: '', delivery_address: '', total_amount_cents: '' });
        setTab('orders');
      }
    } catch { setActionMsg('Error creating order'); }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleBillingPortal = async () => {
    try {
      const res = await apiFetch('/api/merchant/billing/portal', { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        window.location.href = d.portal_url;
      }
    } catch { setActionMsg('Error opening billing portal'); }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: '#111113',
    border: '1px solid #27272a',
    borderRadius: 12,
    padding: 20,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontFamily: 'system-ui, sans-serif' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fff', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top Nav */}
      <header style={{ padding: '0 24px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 30, height: 30, background: '#f59e0b', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#09090b', fontSize: 15 }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{merchant?.store_name || 'Stowry'}</span>
          {merchant?.plan_status && (
            <span style={{ background: STATUS_COLORS[merchant.plan_status] + '22', color: STATUS_COLORS[merchant.plan_status], border: `1px solid ${STATUS_COLORS[merchant.plan_status]}`, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              {merchant.plan === 'growth' ? 'Growth' : 'Access'} · {merchant.plan_status}
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#a1a1aa', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
        >
          Sign Out
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <aside style={{ width: 200, borderRight: '1px solid #27272a', padding: '16px 12px', flexShrink: 0 }}>
          {TABS.map((t) => {
            const labels: Record<Tab, string> = {
              overview: '📊 Overview',
              orders: '📦 Orders',
              tracking: '🚚 Tracking',
              settings: '⚙️ Settings',
              billing: '💳 Billing',
              team: '👥 Team',
            };
            const isTeam = t === 'team' && merchant?.plan !== 'growth';
            return (
              <button
                key={t}
                onClick={() => !isTeam && setTab(t)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  marginBottom: 4,
                  background: tab === t ? '#1e1e20' : 'transparent',
                  border: tab === t ? '1px solid #3f3f46' : '1px solid transparent',
                  color: isTeam ? '#3f3f46' : tab === t ? '#f59e0b' : '#a1a1aa',
                  cursor: isTeam ? 'default' : 'pointer',
                  fontSize: 14,
                  fontWeight: tab === t ? 600 : 400,
                }}
              >
                {labels[t]}
                {isTeam && <span style={{ display: 'block', fontSize: 10, marginTop: 2 }}>Growth only</span>}
              </button>
            );
          })}
        </aside>

        {/* Main Content */}
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {actionMsg && (
            <div style={{ background: '#052e16', border: '1px solid #14532d', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#86efac', fontSize: 14 }}>
              {actionMsg}
            </div>
          )}

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700 }}>Overview</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'Active', value: stats?.active ?? 0, color: '#22c55e' },
                  { label: 'Pending Pickup', value: stats?.pending ?? 0, color: '#f59e0b' },
                  { label: 'Completed Today', value: stats?.completed_today ?? 0, color: '#3b82f6' },
                  { label: 'Failed / Cancelled', value: stats?.failed ?? 0, color: '#ef4444' },
                ].map((s) => (
                  <div key={s.label} style={{ ...cardStyle, textAlign: 'center' }}>
                    <p style={{ margin: '0 0 8px', color: '#71717a', fontSize: 13 }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#a1a1aa' }}>Recent Orders</h3>
              <div style={cardStyle}>
                {recentOrders.length === 0 ? (
                  <p style={{ color: '#52525b', textAlign: 'center', padding: 20 }}>No recent orders</p>
                ) : (
                  recentOrders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => navigate(`/merchant/orders/${o.id}`)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #27272a', cursor: 'pointer' }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{o.customer_name}</p>
                        <p style={{ margin: '2px 0 0', color: '#71717a', fontSize: 12 }}>{new Date(o.created_at).toLocaleString()}</p>
                      </div>
                      <span style={{ background: (STATUS_COLORS[o.status] || '#6b7280') + '22', color: STATUS_COLORS[o.status] || '#6b7280', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                        {o.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ORDERS */}
          {tab === 'orders' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Orders</h2>
                <button
                  onClick={() => setTab('overview')}
                  style={{ background: '#f59e0b', color: '#09090b', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                >
                  + New Order
                </button>
              </div>

              {/* Filter */}
              <div style={{ marginBottom: 16 }}>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setOrderPage(1); }}
                  style={{ ...inputStyle, width: 200 }}
                >
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="assigned">Assigned</option>
                  <option value="picked_up">Picked Up</option>
                  <option value="en_route">En Route</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div style={cardStyle}>
                {orders.length === 0 ? (
                  <p style={{ color: '#52525b', textAlign: 'center', padding: 20 }}>No orders found</p>
                ) : (
                  orders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => navigate(`/merchant/orders/${o.id}`)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #27272a', cursor: 'pointer' }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{o.customer_name}</p>
                        <p style={{ margin: '2px 0 0', color: '#71717a', fontSize: 12 }}>{o.delivery_address} · {new Date(o.created_at).toLocaleString()}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ background: (STATUS_COLORS[o.status] || '#6b7280') + '22', color: STATUS_COLORS[o.status] || '#6b7280', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          {o.status}
                        </span>
                        <span style={{ color: '#a1a1aa', fontSize: 12 }}>${(o.total_amount_cents / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              {orderTotal > 20 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  <button disabled={orderPage === 1} onClick={() => setOrderPage((p) => p - 1)} style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}>Prev</button>
                  <span style={{ padding: '6px 14px', color: '#71717a', fontSize: 14 }}>Page {orderPage}</span>
                  <button disabled={orderPage * 20 >= orderTotal} onClick={() => setOrderPage((p) => p + 1)} style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}>Next</button>
                </div>
              )}

              {/* Create Order Form */}
              <div style={{ ...cardStyle, marginTop: 24 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Create Manual Order</h3>
                <form onSubmit={handleCreateOrder}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Customer Name *</label>
                      <input value={createOrderForm.customer_name} onChange={(e) => setCreateOrderForm((f) => ({ ...f, customer_name: e.target.value }))} required style={inputStyle} placeholder="Jane Smith" />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Phone</label>
                      <input value={createOrderForm.customer_phone} onChange={(e) => setCreateOrderForm((f) => ({ ...f, customer_phone: e.target.value }))} style={inputStyle} placeholder="+1 555-0100" />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Delivery Address *</label>
                    <input value={createOrderForm.delivery_address} onChange={(e) => setCreateOrderForm((f) => ({ ...f, delivery_address: e.target.value }))} required style={inputStyle} placeholder="123 Oak St, Dallas TX 75203" />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Total (cents)</label>
                    <input type="number" value={createOrderForm.total_amount_cents} onChange={(e) => setCreateOrderForm((f) => ({ ...f, total_amount_cents: e.target.value }))} style={inputStyle} placeholder="2999" />
                  </div>
                  <button type="submit" style={{ background: '#f59e0b', color: '#09090b', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                    Create Order
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TRACKING */}
          {tab === 'tracking' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700 }}>Live Tracking</h2>
              <div style={cardStyle}>
                {recentOrders.filter((o) => ['assigned', 'picked_up', 'en_route'].includes(o.status)).length === 0 ? (
                  <p style={{ color: '#52525b', textAlign: 'center', padding: 20 }}>No active deliveries right now</p>
                ) : (
                  recentOrders
                    .filter((o) => ['assigned', 'picked_up', 'en_route'].includes(o.status))
                    .map((o) => (
                      <div
                        key={o.id}
                        onClick={() => navigate(`/merchant/orders/${o.id}`)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #27272a', cursor: 'pointer' }}
                      >
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{o.customer_name}</p>
                          <p style={{ margin: '2px 0 0', color: '#71717a', fontSize: 12 }}>{o.delivery_address}</p>
                        </div>
                        <span style={{ background: (STATUS_COLORS[o.status] || '#6b7280') + '22', color: STATUS_COLORS[o.status] || '#6b7280', padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
                          {o.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700 }}>Store Settings</h2>
              <div style={{ ...cardStyle, maxWidth: 560 }}>
                <form onSubmit={handleSaveSettings}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>First Name</label>
                      <input value={settings.first_name || ''} onChange={(e) => setSettings((s) => ({ ...s, first_name: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Last Name</label>
                      <input value={settings.last_name || ''} onChange={(e) => setSettings((s) => ({ ...s, last_name: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Store Name</label>
                    <input value={settings.store_name || ''} onChange={(e) => setSettings((s) => ({ ...s, store_name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Store Address</label>
                    <input value={settings.store_address || ''} onChange={(e) => setSettings((s) => ({ ...s, store_address: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>Store Phone</label>
                    <input value={settings.store_phone || ''} onChange={(e) => setSettings((s) => ({ ...s, store_phone: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
                    <div>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>City</label>
                      <input value={settings.city || ''} onChange={(e) => setSettings((s) => ({ ...s, city: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>State</label>
                      <input value={settings.state || ''} onChange={(e) => setSettings((s) => ({ ...s, state: e.target.value }))} style={inputStyle} maxLength={2} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: 12, marginBottom: 4 }}>ZIP</label>
                      <input value={settings.zip || ''} onChange={(e) => setSettings((s) => ({ ...s, zip: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>
                  <button type="submit" disabled={savingSettings} style={{ background: '#f59e0b', color: '#09090b', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* BILLING */}
          {tab === 'billing' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700 }}>Billing</h2>

              <div style={{ ...cardStyle, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: '0 0 4px', color: '#a1a1aa', fontSize: 13 }}>Current Plan</p>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                      Stowry {merchant?.plan === 'growth' ? 'Growth' : 'Access'}
                      {' '}
                      <span style={{ background: (STATUS_COLORS[merchant?.plan_status || ''] || '#6b7280') + '22', color: STATUS_COLORS[merchant?.plan_status || ''] || '#6b7280', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                        {merchant?.plan_status}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={handleBillingPortal}
                    style={{ background: '#18181b', border: '1px solid #3f3f46', color: '#a1a1aa', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
                  >
                    Manage Billing
                  </button>
                </div>
              </div>

              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#a1a1aa' }}>Invoice History</h3>
                {invoices.length === 0 ? (
                  <p style={{ color: '#52525b', textAlign: 'center', padding: 16 }}>No invoices yet</p>
                ) : (
                  invoices.map((inv) => (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #27272a' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 14 }}>${(inv.amount_cents / 100).toFixed(2)}</p>
                        <p style={{ margin: '2px 0 0', color: '#71717a', fontSize: 12 }}>{new Date(inv.created_at).toLocaleDateString()}</p>
                      </div>
                      <span style={{ background: (STATUS_COLORS[inv.status] || '#6b7280') + '22', color: STATUS_COLORS[inv.status] || '#6b7280', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                        {inv.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TEAM */}
          {tab === 'team' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700 }}>Team</h2>
              {merchant?.plan !== 'growth' ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
                  <p style={{ color: '#71717a', marginBottom: 16 }}>Team management is available on the Growth plan.</p>
                  <button
                    onClick={() => navigate('/merchant/pricing')}
                    style={{ background: '#f59e0b', color: '#09090b', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Upgrade to Growth
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ ...cardStyle, marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#a1a1aa' }}>Staff Members</h3>
                    {staff.length === 0 ? (
                      <p style={{ color: '#52525b', textAlign: 'center', padding: 16 }}>No staff members yet</p>
                    ) : (
                      staff.map((s) => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #27272a' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{s.first_name || ''} {s.last_name || ''} {(!s.first_name && !s.last_name) ? s.email : ''}</p>
                            <p style={{ margin: '2px 0 0', color: '#71717a', fontSize: 12 }}>{s.email} · {s.role}</p>
                          </div>
                          <span style={{ color: s.is_active ? '#22c55e' : '#6b7280', fontSize: 12 }}>{s.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#a1a1aa' }}>Invite Staff</h3>
                    <form onSubmit={handleInviteStaff} style={{ display: 'flex', gap: 10 }}>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        required
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder="staff@store.com"
                      />
                      <button type="submit" style={{ background: '#f59e0b', color: '#09090b', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}>
                        Invite
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MerchantDashboard;
