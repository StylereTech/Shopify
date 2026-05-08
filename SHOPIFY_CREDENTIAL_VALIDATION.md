# Shopify Credential / Listing Validation Path

Status: `PARTIAL` locally; live install/listing validation is `HUMAN-CREDENTIAL-BLOCKED` until Shopify Partner/admin credentials and a test store install context are available.

## Required Secrets
Configured either in local `.env` or deployment provider secrets, never committed:

- `SHOPIFY_API_KEY` — Shopify Partner app API key.
- `SHOPIFY_API_SECRET` — Shopify Partner app API secret.
- `SHOPIFY_SCOPES` — expected: `write_shipping,read_orders,read_locations`.
- `TOKEN_ENCRYPTION_KEY_HEX` — 64 hex chars for stored Shopify token encryption.
- `APP_URL` — public backend URL used in OAuth callbacks/webhooks.
- `FRONTEND_URL` — public frontend URL.
- DoorDash/Stripe/DB/Redis secrets from `.env.example` as needed for quote/dispatch/payment flows.

## OAuth / Install Routes Found
Local source paths:

- `src/shopify/auth.ts` — OAuth flow and callback helpers.
- `src/shopify/token-vault.ts` — encrypted token persistence boundary.
- `src/shopify/graphql-admin-client.ts` — Admin GraphQL client.
- `src/shopify/carrier-service-manager.ts` — carrier-service registration/management.
- `src/shopify/hmac.ts` — request verification.
- `src/api/orders.ts` — order/quote/payment/webhook flow.
- `src/domain/dispatch-orchestrator.ts` — dispatch provider orchestration.

## Validation Commands
Local gates:

```bash
npm run typecheck
npm run build
npm test
```

Live/store gates once credentials are provided:

```bash
# Do not print secret values.
# Confirm provider env has SHOPIFY_API_KEY, SHOPIFY_API_SECRET, TOKEN_ENCRYPTION_KEY_HEX, APP_URL.
# Install/reinstall app on a Shopify development store.
# Confirm OAuth callback succeeds.
# Confirm carrier service registers.
# Confirm quote callback returns expected delivery rate.
# Confirm webhook HMAC verification passes.
```

## Exact Human Action Required
1. Provide or configure Shopify Partner app API key/secret in the deployment provider.
2. Provide development store/admin install context.
3. Confirm final app listing URL/settings in Shopify Partner dashboard.
4. Run install/reinstall validation against the development store.

## Current Judgment
`PARTIAL`: local code path and required env placeholders are documented; live install/listing validation remains credential-blocked.
