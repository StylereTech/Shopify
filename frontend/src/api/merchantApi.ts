const BASE = import.meta.env.VITE_API_URL ?? 'https://api-production-653e.up.railway.app';

function getToken(): string | null {
  return localStorage.getItem('merchant_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

export const merchantApi = {
  plans: () => api<{ plans: Plan[] }>('/api/merchant/plans'),
  register: (body: RegisterBody) =>
    api<{ merchant: Merchant; checkout_url: string; message: string }>(
      '/api/merchant/auth/register',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  login: (email: string, password: string) =>
    api<{ token: string; merchant: Merchant }>('/api/merchant/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => api('/api/merchant/auth/logout', { method: 'POST' }),
  me: () => api<Merchant>('/api/merchant/auth/me'),
  dashboard: () => api<DashboardStats>('/api/merchant/dashboard'),
  orders: (page = 1) =>
    api<{ orders: Order[]; total: number; page: number; pages: number }>(
      `/api/merchant/orders?page=${page}`
    ),
  orderDetail: (id: string) => api<Order>(`/api/merchant/orders/${id}`),
  settings: () => api<Merchant>('/api/merchant/settings'),
  updateSettings: (body: Partial<Merchant>) =>
    api<Merchant>('/api/merchant/settings', { method: 'PUT', body: JSON.stringify(body) }),
  billing: () =>
    api<{ invoices: Invoice[]; plan: string; plan_status: string }>('/api/merchant/billing'),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  price_cents: number;
  price_display: string;
  features: string[];
  popular?: boolean;
}

export interface Merchant {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  store_name: string;
  store_address?: string;
  store_phone?: string;
  city?: string;
  state?: string;
  zip?: string;
  plan: string;
  plan_status: string;
  onboarding_path: string;
  checkout_url?: string;
  created_at: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  store_name: string;
  city?: string;
  state?: string;
  plan: string;
}

export interface DashboardStats {
  active_orders: number;
  pending_pickup: number;
  completed_today: number;
  failed_cancelled: number;
}

export interface Order {
  id: string;
  status: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: Record<string, string>;
  delivery_address?: string;
  total_cents?: number;
  total_amount_cents?: number;
  items?: unknown;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  amount_cents: number;
  status: string;
  period_start?: string;
  period_end?: string;
  created_at: string;
}
