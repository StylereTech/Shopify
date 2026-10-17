-- Account ownership is explicit. Historical rows are deliberately not backfilled.
ALTER TABLE storree_orders ADD COLUMN IF NOT EXISTS merchant_account_id UUID REFERENCES merchants(id) ON DELETE SET NULL;
ALTER TABLE storree_orders ADD COLUMN IF NOT EXISTS merchant_request_id UUID;
ALTER TABLE storree_orders ADD COLUMN IF NOT EXISTS merchant_request_fingerprint TEXT;
ALTER TABLE storree_orders ADD COLUMN IF NOT EXISTS declared_amount_cents BIGINT CHECK (declared_amount_cents BETWEEN 0 AND 9007199254740991);
ALTER TABLE storree_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS storree_orders_merchant_request_idx ON storree_orders (merchant_account_id, merchant_request_id) WHERE merchant_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS storree_orders_merchant_created_idx ON storree_orders (merchant_account_id, created_at DESC, id);

-- These fields are already part of DeliveryJob; create must persist the verified webhook domain.
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS shop_domain TEXT;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS shopify_order_number TEXT;
ALTER TABLE delivery_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Provision only after independently verifying the account, installed shop and delivery merchant.
-- No public API can write this binding; merchant_configs is not ownership evidence.
CREATE TABLE IF NOT EXISTS merchant_shop_bindings (
  merchant_account_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  shop_domain TEXT PRIMARY KEY REFERENCES shops(shop_domain) ON DELETE CASCADE,
  delivery_merchant_id TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL,
  CHECK (shop_domain = lower(shop_domain) AND shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$')
);
CREATE INDEX IF NOT EXISTS merchant_shop_bindings_account_idx ON merchant_shop_bindings (merchant_account_id);
CREATE INDEX IF NOT EXISTS delivery_jobs_merchant_shop_created_idx ON delivery_jobs (merchant_id, shop_domain, created_at DESC);

-- Record future confirmed transitions; updated_at is not proof of historical delivery time.
CREATE OR REPLACE FUNCTION capture_merchant_order_completion() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL THEN
    NEW.completed_at := OLD.completed_at;
  ELSIF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS storree_orders_completion ON storree_orders;
CREATE TRIGGER storree_orders_completion BEFORE UPDATE OF status ON storree_orders FOR EACH ROW EXECUTE FUNCTION capture_merchant_order_completion();
DROP TRIGGER IF EXISTS delivery_jobs_completion ON delivery_jobs;
CREATE TRIGGER delivery_jobs_completion BEFORE UPDATE OF status ON delivery_jobs FOR EACH ROW EXECUTE FUNCTION capture_merchant_order_completion();
