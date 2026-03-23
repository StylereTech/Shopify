-- storree_orders: persists direct-link customer orders (Style.re Shopify direct flow)
-- Covers: order details, payment status, dispatch ID, tracking URL, customer info

CREATE TABLE IF NOT EXISTS storree_orders (
  id                        TEXT PRIMARY KEY,
  service_type              TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending',
  pickup_address            JSONB NOT NULL DEFAULT '{}',
  dropoff_address           JSONB NOT NULL DEFAULT '{}',
  items                     JSONB NOT NULL DEFAULT '[]',
  contact                   JSONB NOT NULL DEFAULT '{}',
  notes                     TEXT,
  pricing                   JSONB NOT NULL DEFAULT '{}',
  payment_intent_id         TEXT,
  stripe_payment_intent_id  TEXT,
  payment_status            TEXT NOT NULL DEFAULT 'unpaid',
  doordash_delivery_id      TEXT,
  doordash_external_id      TEXT,
  doordash_tracking_url     TEXT,
  dispatch_id               TEXT,
  merchant_notified         BOOLEAN NOT NULL DEFAULT FALSE,
  shop_domain               TEXT,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS storree_orders_status_idx       ON storree_orders (status);
CREATE INDEX IF NOT EXISTS storree_orders_payment_idx      ON storree_orders (stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS storree_orders_dispatch_idx     ON storree_orders (dispatch_id);
CREATE INDEX IF NOT EXISTS storree_orders_created_at_idx   ON storree_orders (created_at DESC);
