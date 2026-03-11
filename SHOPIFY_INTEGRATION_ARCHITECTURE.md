# Shopify Integration Architecture

## Core operational flow
1. Shopify checkout requests rates via CarrierService callback.
2. Shopify sends paid-order webhook for Storree-selected shipping method.
3. API verifies signature, journals webhook event, enqueues Redis job, returns 202.
4. Worker consumes queue, applies idempotency, calls Storree dispatch API.
5. Delivery job + dispatch attempts + audit logs persist to Postgres.
6. Retryable failures requeue until threshold; terminal/retry-exhausted failures move to DLQ.

## Components
- **API**: auth/install, onboarding readiness, quote endpoint, webhook ingestion.
- **Worker**: async dispatch execution and retry handling.
- **Postgres**: durable source of truth for jobs/config/audit.
- **Redis**: queue and dead-letter buffering.
- **Storree API client**: real transport with auth, timeout, retry, and connectivity checks.

## Observability surface
- `GET /health` (liveness)
- `GET /health/ready` (DB/Redis/Storree readiness)
- `GET /metrics` (webhook, queue, dispatch, quote metrics)

## Merchant onboarding readiness model
- app installed
- token present
- oauth valid
- carrier service registered
- compliance config expected
- pickup location configured
- merchant config complete
- dispatch connectivity status
- explicit reasons when incomplete
