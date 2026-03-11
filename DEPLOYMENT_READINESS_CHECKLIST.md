# Deployment Readiness Checklist

## Application Configuration
- [x] `.env` schema defined (`src/config/env.ts`).
- [x] Storree API auth/timeout/retry env contract defined.
- [x] Startup self-checks for DB/Redis/Storree implemented.
- [ ] Production secrets managed via secret manager/KMS.

## Shopify Setup
- [ ] App registration complete in Shopify Partners.
- [x] OAuth callback + persisted state validation implemented.
- [x] GraphQL carrier service manager implemented.
- [x] Compliance webhook app config artifact added (`shopify.app.toml`).
- [ ] App config pushed and verified in partner/dev environment.

## Data + Infra
- [x] Postgres repositories implemented.
- [x] SQL migration runner implemented.
- [x] Redis queue + worker + DLQ path implemented.
- [x] Dispatch attempt persistence includes retry/error/provider metadata.

## Reliability
- [x] Real Storree transport implemented.
- [x] Retry classification (retryable vs terminal) implemented.
- [x] Readiness probe checks DB, Redis, and Storree connectivity.
- [x] Fail-closed behavior when Storree connectivity is unhealthy.
- [x] Carrier-service prerequisite visibility added to onboarding readiness output.

## Security
- [x] Webhook HMAC verification implemented.
- [x] OAuth state replay/expiry checks implemented.
- [x] Token encryption boundary implemented.
- [ ] KMS/HSM key lifecycle automation implemented.

## Observability
- [x] Metrics endpoint with counters/gauges/timers implemented.
- [x] Correlation-aware structured logs implemented.
- [ ] External metrics backend and alerting policy configured.

## Live Launch Validation Evidence (required for GO)
- [ ] Dev-store install validated end-to-end.
- [ ] Dev-store carrier-service rate callback verified at checkout.
- [ ] Dispatch execution path validated against Storree (mock or live).
- [ ] Evidence captured in `DEV_STORE_VALIDATION_REPORT.md` and `LAUNCH_READINESS_REPORT.md`.
