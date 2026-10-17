-- New guest capabilities only. No historical identity is inferred from email, phone or order IDs.
CREATE TABLE IF NOT EXISTS customer_guest_sessions (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS customer_checkout_orders (
  order_id TEXT PRIMARY KEY REFERENCES storree_orders(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES customer_guest_sessions(id),
  request_id UUID NOT NULL,
  request_fingerprint TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'usd'),
  quote_version TEXT NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  intent_started_at TIMESTAMPTZ,
  dispatch_status TEXT NOT NULL DEFAULT 'pending' CHECK (dispatch_status IN ('pending','in_progress','unknown','submitted')),
  dispatch_started_at TIMESTAMPTZ,
  events JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(events) = 'array' AND jsonb_array_length(events) <= 32),
  UNIQUE (guest_id, request_id)
);
CREATE INDEX IF NOT EXISTS customer_checkout_guest_idx ON customer_checkout_orders(guest_id, order_id);
-- Minimal replay tombstones survive deletion of the order payload and receipts.
CREATE TABLE IF NOT EXISTS customer_retired_requests (
  guest_id UUID NOT NULL REFERENCES customer_guest_sessions(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guest_id, request_id)
);
