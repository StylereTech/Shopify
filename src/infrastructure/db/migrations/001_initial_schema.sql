CREATE TABLE IF NOT EXISTS shops (
  shop_domain TEXT PRIMARY KEY,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  access_token_tag TEXT NOT NULL,
  scopes TEXT NOT NULL,
  installed_at TIMESTAMP NOT NULL,
  carrier_service_id TEXT
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchant_configs (
  merchant_id TEXT NOT NULL,
  shop_domain TEXT PRIMARY KEY,
  storree_merchant_id TEXT NOT NULL,
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  shopify_location_id TEXT,
  radius_km REAL NOT NULL,
  one_hour_enabled BOOLEAN NOT NULL,
  same_day_enabled BOOLEAN NOT NULL,
  one_hour_cutoff_hour_local INTEGER NOT NULL,
  same_day_cutoff_hour_local INTEGER NOT NULL,
  base_fee_cents INTEGER NOT NULL,
  price_per_km_cents INTEGER NOT NULL,
  platform_markup_percent REAL NOT NULL,
  timezone TEXT NOT NULL,
  is_active BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_jobs (
  id TEXT PRIMARY KEY,
  shopify_order_id TEXT UNIQUE NOT NULL,
  merchant_id TEXT NOT NULL,
  service_level TEXT NOT NULL,
  status TEXT NOT NULL,
  dispatch_id TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  received_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS dispatch_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempted_at TIMESTAMP NOT NULL,
  success BOOLEAN NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_class TEXT,
  provider_status_code INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  correlation_id TEXT,
  metadata_json TEXT
);
