-- Notification outbox for idempotent customer/admin SMS
-- Style.re 1.1 parity: NotificationOutbox model pattern

CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  channel TEXT NOT NULL,       -- 'sms' | 'email'
  template TEXT NOT NULL,      -- e.g. 'order_picked_up', 'dispatch_failed'
  dedup_key TEXT UNIQUE NOT NULL, -- e.g. 'job:<id>:picked_up'
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status ON notification_outbox(status, created_at);

-- Add customer_phone to delivery_jobs for notification routing
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS shop_domain TEXT;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS shopify_order_number TEXT;
