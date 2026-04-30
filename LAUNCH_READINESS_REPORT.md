# Launch Readiness Report (Cycle 9 — 2026-04-30)

## Executive decision
- **GO/NO-GO:** **NO-GO for Shopify App Store submission today**
- Reason: code has been hardened to the current DoorDash-only production direction, but required real-environment install-to-dispatch evidence is still missing and the Shopify Partners dashboard is currently blocked by browser connection verification.

## What is validated in repo
- Standalone `/Shopify` repo is the Shopify app source of truth.
- Production dispatch provider is DoorDash Drive only.
- `DISPATCH_PROVIDER=storree` was removed from the runtime enum.
- `DISPATCH_PROVIDER=fake` is blocked in production.
- API and worker now fail startup if DoorDash credentials are missing while `DISPATCH_PROVIDER=doordash`.
- DoorDash customer notifications are disabled so customer-facing communication stays under the Style.re/Storree experience.
- Customer/merchant API responses now expose generic `deliveryId` / `trackingUrl` instead of DoorDash-branded response fields.
- Customer tracking URL points to `https://stylere.app/shopify/tracking/{orderId}`.

## Validation gates passed on 2026-04-30
- `npm run typecheck` — PASS
- `npm test` — PASS, 11 test files / 42 tests
- `npm run build` — PASS
- `cd frontend && npm run build` — PASS after generic tracking URL frontend update

## What is live-URL validated
- `https://stylere.app/shopify` loads the Shopify merchant landing page.
- Public legal/support routes are expected at:
  - `https://stylere.app/shopify/privacy`
  - `https://stylere.app/shopify/terms`
  - `https://stylere.app/shopify/support`

## Open launch blockers
1. Shopify Partners dashboard access is blocked in the automated browser by: **“Your connection needs to be verified before you can proceed.”**
2. Railway CLI is installed but not logged in, so production deploy verification from CLI is blocked by `Unauthorized. Please login with railway login`.
3. Real dev-store app install and OAuth callback evidence is still missing.
4. Live carrier-service registration/verification evidence is still missing.
5. Live checkout quote callback evidence is still missing.
6. Live paid-order webhook → worker → DoorDash dispatch evidence is still missing.
7. Live DB rows and metrics/log snapshots for `webhook_events`, `delivery_jobs`, `dispatch_attempts`, and `audit_logs` are still missing.
8. App Store visual assets still need final capture/approval if not already uploaded in Shopify Partners.

## Required next run
- Complete Shopify browser connection verification manually or from a trusted user browser session.
- Push/deploy current repo to the production backend/frontend targets.
- Install the app in a Shopify development store.
- Capture OAuth callback + granted scopes.
- Force carrier-service registration and capture GraphQL response.
- Execute checkout quote tests.
- Execute paid-order dispatch test and capture DoorDash delivery creation evidence.
- Capture DB rows and metrics/log snapshots.
- Only then submit to Shopify App Store review.

## Recommendation
Do not claim final production readiness or submit for Shopify review until the evidence above is captured. The code direction is now aligned with current Style.re production truth, but Shopify review submission should wait for live install-to-dispatch proof or a human-assisted dashboard session.
