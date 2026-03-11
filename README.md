# Storree Shopify Delivery App

Infrastructure-ready Shopify app baseline for Storree one-hour and same-day local delivery.

## Cycle 8 status
- **Release decision: NO-GO** (missing live dev-store evidence for install-to-dispatch).
- Reports:
  - `DEV_STORE_VALIDATION_REPORT.md`
  - `LAUNCH_READINESS_REPORT.md`

## Runtime components
1. API service (`npm run dev` / `npm start`)
2. Worker service (`npm run worker`)
3. Postgres (durable state)
4. Redis (queue + DLQ)

## Required environment variables
- `PORT`
- `APP_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_SCOPES`
- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_QUEUE_KEY`
- `REDIS_DEAD_LETTER_KEY`
- `WORKER_MAX_RETRIES`
- `TOKEN_ENCRYPTION_KEY_HEX` (64-char hex)
- `STORREE_API_BASE_URL`
- `STORREE_API_KEY`
- `STORREE_TIMEOUT_MS`
- `STORREE_MAX_RETRIES`

## Operational endpoints
- `GET /health`
- `GET /health/ready`
- `GET /metrics`
- `GET /shopify/onboarding/status?shop=<shop-domain>`

## Startup and fail-closed controls
- API/worker run startup checks for DB, Redis, and Storree.
- API/worker refuse startup when DB or Redis are unavailable.
- If Storree connectivity is unhealthy:
  - checkout quote callback returns no Storree rates
  - paid-order webhook returns `503` and does not enqueue dispatch work

## Onboarding risk controls
Onboarding response includes carrier-service prerequisite metadata from Shopify plan context to catch potential eligibility issues before launch (`carrierServicePrerequisites`).

## Deployment
```bash
npm run migrate
npm run start
npm run worker
```

## Production claim policy
Do not claim production readiness until at least one real dev-store end-to-end flow is evidenced.
