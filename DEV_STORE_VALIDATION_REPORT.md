# Dev Store Validation Report (Cycle 8)

## Validation environment
- Repository: `/workspace/Shopify`
- Date: 2026-03-10
- Environment limitation: npm registry access blocked (`403 Forbidden`), preventing local dependency installation and runtime test execution.
- Shopify dev-store credentials/Partner access: not provided in this environment.
- Storree live API credentials/environment: not provided in this environment.

## Required live validation target
`install -> onboarding -> carrier-service registration -> quote callback -> paid-order webhook -> queue -> worker -> Storree dispatch`

## Real-environment validation status
### Validated live
- None (credentials and environment access unavailable).

### Attempted but blocked
1. Install/auth validation in dev store.
2. Carrier service registration evidence capture.
3. Checkout quote callback evidence.
4. Paid-order webhook to queue/worker/dispatch evidence.

## Mock/code-level validation available
- OAuth + state semantics: `tests/auth.test.ts`
- Webhook signature checks: `tests/hmac.test.ts`, `tests/webhook.test.ts`
- Storree transport behavior: `tests/storree-client.test.ts`
- Retry classification: `tests/worker-retry.test.ts`
- Fail-closed behavior: `tests/failclosed.test.ts`

## Evidence updates made in Cycle 8
- Added carrier-service prerequisite check endpoint data in onboarding status (`carrierServicePrerequisites`) to reduce risk where Shopify carrier-service eligibility conditions block registration.
- Added startup checks and fail-fast API/worker startup behavior as explicit release controls.
- Preserved fail-closed behavior for rates/webhooks when Storree is unhealthy.

## Live evidence still required before GO
1. Dev-store install success trace (shop, scopes, callback success).
2. Carrier service mutation/query proof from live shop.
3. Checkout quote invocation proof for eligible + ineligible addresses.
4. Paid-order webhook receipt + queue + worker + Storree dispatch + DB persistence proof.
