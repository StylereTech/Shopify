-- Migration 004: Merchant Platform
-- Adds tables for merchant accounts, staff, billing, and sessions

-- Merchant accounts (unified for Shopify + direct retailers)
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  store_name TEXT NOT NULL,
  store_address TEXT,
  store_phone TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  onboarding_path TEXT NOT NULL DEFAULT 'direct', -- 'shopify' or 'direct'
  shopify_shop_domain TEXT,
  plan TEXT NOT NULL DEFAULT 'access', -- 'access' or 'growth'
  plan_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'past_due', 'cancelled'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Merchant staff/team members
CREATE TABLE IF NOT EXISTS merchant_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- 'owner', 'admin', 'staff'
  first_name TEXT,
  last_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Merchant billing history
CREATE TABLE IF NOT EXISTS merchant_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'paid', 'pending', 'failed'
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Merchant sessions (JWT-based auth)
CREATE TABLE IF NOT EXISTS merchant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_merchant_sessions_token_hash ON merchant_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_merchant_sessions_merchant_id ON merchant_sessions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_merchant_id ON merchant_staff(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_billing_merchant_id ON merchant_billing(merchant_id);
