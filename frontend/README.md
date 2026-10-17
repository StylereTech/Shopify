# Shopify frontend route guide

This is the editable source for the app under `/shopify`. The main Style.re repository embeds a compiled copy; edits to this source do not update that copy or production automatically. Do not edit generated JavaScript to change a page.

## Page routes

The main website gateway identifies this shell as **S-20**. These internal IDs match the main site's `docs/frontend/SHOPIFY-ROUTEBOOK.md`.

| ID | Route after `/shopify` | Source under `src/screens` | Main checks |
| --- | --- | --- | --- |
| SH-01 | `/`, `/merchant`, `/merchant-landing` | `MerchantLanding.tsx` | Install, plans and sign-in entry; copy and imagery |
| SH-02 | `/order` | `Landing.tsx` | Delivery entry, saved draft/order and unresolved request recovery |
| SH-03 | `/address` | `AddressForm.tsx` | Pickup, destination and contact validation |
| SH-04 | `/summary?orderId=…` | `OrderSummary.tsx` | Explicit idempotent creation/recovery; authoritative order and quote |
| SH-05 | `/payment?orderId=…` | `Payment.tsx` | Saved Stripe intent, Payment Element/wallets, bounded verification and uncertain-outcome recovery |
| SH-06 | `/confirmation` | `Confirmation.tsx` | Server-paid receipt; no local-only success |
| SH-07 | `/tracking/:orderId` | `Tracking.tsx` | Payment and dispatch status; missing/error states |
| SH-08 | `/chat/:orderId` | `Chat.tsx` | Owned order context; courier messaging explicitly unavailable |
| SH-09 | `/orders?page=1&status=pending` | `OrderHistory.tsx` | Server-paginated guest-owned history, status tabs and later-page recovery |
| SH-10 | `/merchant/pricing` | `merchant/MerchantPricing.tsx` | Current plans, error/retry, one monthly price |
| SH-11 | `/merchant/signup` | `merchant/MerchantSignup.tsx` | Current plan, duplicate guard, account receipt and approved Stripe destination |
| SH-12 | `/merchant/login` | `merchant/MerchantLogin.tsx` | Credential validation, cancellation and safe return destination |
| SH-13 | `/merchant/dashboard` | `MerchantDashboard.tsx` | Six sections listed below; verified account required |
| SH-14 | `/merchant/orders/:id` | `merchant/MerchantOrderDetail.tsx` | Exact owned record; errors, null historical data and return to filters |
| SH-15 | `/privacy` | `PrivacyPolicy.tsx` | Legal content |
| SH-16 | `/terms` | `TermsOfService.tsx` | Legal content |
| SH-17 | `/support` | `SupportPage.tsx` | Available support paths |

## Merchant sections

Use `/shopify/merchant/dashboard?tab=<section>` to open a section directly. `status`, `page` and `trackingPage` retain the selected list. Detail links carry a validated `returnTo`; sign-in recovery retains this context too.

| Section | Behavior and authoritative result |
| --- | --- |
| `overview` | All owned order counts, UTC completion counts and five recent records; missing Shopify linkage is explicit |
| `orders` | Status filters, pagination and manual record form. A saved record is pending/unpaid; it is not a delivery booking or charge. Recovery reuses the durable request ID. |
| `tracking` | Paginated pending/in-progress owned records with periodic refresh. This is not live driver location. |
| `settings` | Load the saved profile before editing; verify the saved fields; reload after an uncertain write |
| `billing` | Recorded invoices and subscription; validated Stripe portal destination |
| `team` | Growth-plan roster. Adding a record does not send an invitation or create staff login access. Other plans can reach billing and compare features. |

## Shared request and account boundaries

- Customer `src/api/customerSession.ts` uses a same-origin HttpOnly cookie and captured public guest UUID, a complete-response deadline, cancellation and no automatic write retry. `src/context/customerSessionController.ts` verifies the cookie and invalidates obsolete page scopes. Guest history belongs to the seven-day browser capability, not an account or another device.
- `src/store/orderStore.ts` durably saves the request UUID and frozen payload before creation, blocks draft replacement while unresolved, and accepts only a matching server receipt. `src/lib/customerContracts.ts` validates ownership, quote totals, payment intent and tracking data. The browser never chooses the charge amount.

- `src/api/merchantSession.ts` captures the account credential, limits requests to merchant endpoints, enforces a 15-second fetch/body deadline and rejects obsolete responses. Writes are not retried automatically.
- `src/context/merchantAuthController.ts` owns account verification and credential generation. Unavailable service leaves credentials intact while account data is hidden. An authoritative 401 removes only the current credential.
- `src/context/useMerchantSession.ts` gives page requests a nonsecret generation key, verified owner and cancellation scope.
- `src/api/merchantDashboardApi.ts` validates the dashboard response contracts. `src/lib/merchantPageContracts.ts` validates public flow/detail data and navigation destinations.
- Public pricing, registration and login requests do not inherit a previous account's bearer token. Local storage tokens remain script-readable; migrating to server-managed cookies is a separate authentication design task.

## Local checks

From the repository root, install locked dependencies with `npm ci`, then run:

```text
npm test
npm run test:frontend:callbacks
npm run typecheck
npm run build
```

From `frontend`, use its own lockfile and `npm ci`, then `npm run lint` and `npm run build`. These are source/contract/build checks. They do not establish browser rendering, real checkout, installed-shop ownership or production acceptance.

## Release gates

The new merchant order contract needs backend migration 005 and an explicit merchant signing secret. Historical order ownership is not guessed or automatically backfilled. Verified shop/account bindings require separate trusted provisioning; an unlinked account must show coverage unavailable.

Keep source and any embedded release bundle at the same tested revision. Do not deploy the frontend contract ahead of its API and database dependencies. Browser/mobile/accessibility review, authenticated real data, sandbox billing and install-to-dispatch evidence remain required. See `../MERCHANT-FLOW-REVIEW-2026-10-17.md` for this batch's evidence and limits.

Customer checkout additionally needs migration 006, exact `CUSTOMER_ALLOWED_ORIGINS`, working Secure-cookie proxying and configured provider credentials. See [the customer review](../CUSTOMER-CHECKOUT-REVIEW-2026-10-17.md) and [backend handoff](../docs/CUSTOMER-CHECKOUT-HANDOFF-2026-10-17.md). Customer retention and dispatch recovery have bounded dry-run/apply jobs; production scheduling is not installed by this source change. The approved retention period is 90 days after each completed order. Merchant/Shopify webhook and queue copies require coordinated retention work before universal enforcement can be claimed.
