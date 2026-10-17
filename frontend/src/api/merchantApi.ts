import { merchantRequest } from './merchantSession';

export const merchantApi = {
  // Public requests never inherit another merchant's stored credentials.
  plans: (signal?: AbortSignal) => merchantRequest('/api/merchant/plans', { signal }),
  register: (body: RegisterBody, signal?: AbortSignal) => merchantRequest('/api/merchant/auth/register', {
    method: 'POST', body: JSON.stringify(body), signal,
  }),
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
  first_name?: string | null;
  last_name?: string | null;
  store_name: string;
  store_address?: string | null;
  store_phone?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  plan: string;
  plan_status: string;
  onboarding_path?: string;
  created_at?: string;
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
