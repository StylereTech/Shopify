# Merchant flow review — October 17, 2026

## Scope

This source batch follows the all-page Style.re frontend audit and the user's request to continue without a browser run. It covers SH-01 and SH-10–SH-14, including every merchant dashboard section. The public Help, How It Works, For Retailers, Resources and About changes remain in the main website's earlier draft review stack; this batch does not replace that work or establish production appearance.

The editable frontend remains in this repository. The main website's S-20 shell embeds a separate distribution. Source changes, a passing build and a pull request do not deploy either service.

## Frontend repairs

- Merchant entry exposes pricing and sign in. The bitmap hero with baked-in logos and promotional claims is replaced by a responsive HTML/SVG handoff diagram: store details, checkout review, pickup handoff and order updates. Unsupported instant-install, no-monthly-fee and guaranteed-delivery claims are removed. Existing app-install requirements remain explicit.
- Pricing requires complete server plans and displays one monthly price derived from integer cents. Signup verifies the selected plan, returned account and Stripe checkout destination, locks duplicate submissions, and offers account recovery after an unconfirmed result.
- Sign in, account verification and page requests are bounded by account generation and cancellation. Failed profile checks show recovery rather than false logout or empty results. Credential changes cancel obsolete requests. Public requests do not inherit a stored account token.
- The merchant entry, pricing, signup, login, detail and six-section dashboard share the main site's warm-white, ink and orange palette, visible focus, labeled forms and responsive source rules. Tabs, filters and pagination are addressable. Account keys are nonsecret; request credentials are captured, not reread midway through a request.
- Overview and list counts describe owned records. Unknown historical completion times and absent verified Shopify linkage are explicit. Tracking pages pending/in-progress records instead of using only five recent orders.
- Manual order success requires a validated owned receipt and request ID. The record is pending/unpaid and has no payment, delivery quote or dispatch. Declared merchandise value is stored separately from authoritative delivery pricing. Uncertain retries retain the same request identity.
- Settings load before editing and verify submitted fields against saved data. Billing validates the hosted portal destination. Team says staff roster, because the existing API does not send invitations or create staff sign-in access.
- Detail accepts only the requested owned order, displays missing historical fields honestly, and retains the dashboard context through sign-in recovery and Back links.

## Supporting API and database corrections

The existing merchant order API queried records without a trustworthy ownership boundary and projected columns absent from the actual table. The replacement repository uses explicit `merchant_account_id` for standalone records and a verified account/shop/delivery-merchant binding plus matching persisted shop domain for Shopify jobs.

Migration `005_merchant_order_ownership.sql` adds these fields and an empty binding table. It does not infer owners, copy public merchant configuration into trusted bindings, or assign old orders automatically. Unassigned history remains excluded and is described as such in the UI. A separate verified provisioning process is still required before an account can see its installed Shopify store's jobs.

Manual creation has a durable merchant/request uniqueness constraint, payload fingerprint and recovery lookup. These record-only rows are excluded from public customer reads and cannot enter customer payment, confirmation or dispatch paths. New future delivered transitions record a completion time; historical completion times are not guessed from `updated_at`.

Merchant authentication separates invalid credentials from database outages, closes its database pool, and requires an explicitly configured signing secret. A service outage must not become an authoritative credential rejection.

## Evidence

The regression run passed 84 checks across 14 Vitest files. The focused merchant backend run passed 32 checks, including six filter-boundary cases and nine real PostgreSQL cases; 17 authentication/record-guard cases overlap the regression run. Together these establish 99 distinct passing Vitest cases.

The isolated PostgreSQL run applied all five migrations and exercised tenant isolation, deliberate exclusion of unassigned history, verified shop bindings, request replay/conflict/recovery, and timestamps with a non-UTC database session. It caught a real UTC day-boundary defect; the corrected query passed the rerun. The disposable local server was stopped afterward. No hosted database or provider account was used.

Final frontend lint and all 43 focused page/callback checks passed. The final frontend production build passed: 120 modules transformed, 4.29 seconds. Its asset manifest contains the Style.re logo and no longer includes the removed hero collage. Backend typecheck and build passed. This batch has 142 distinct passing checks across the suites above; no browser was run. Source verification is not rendered or production acceptance.

Stripe redirect checks validate the exact approved HTTPS origins while preserving the provider's opaque URL fragment. Stripe's [Checkout Session object](https://docs.stripe.com/api/checkout/sessions/object) includes a URL example with such a fragment; stripping it would change the provider's authoritative destination. The [Billing Portal Session object](https://docs.stripe.com/api/customer_portal/sessions/object) documents its hosted portal URL.

## Release and acceptance gates

1. Review/apply the API changes and migration through the normal backend release process, with rollback and configured merchant signing secret. No hosted database migration is performed by this audit.
2. Independently verify and provision merchant/shop ownership before enabling linked-shop visibility. Historical/unassigned records require an explicit reconciliation decision, not an automatic backfill.
3. Publish a corresponding frontend from this tested source. Keep the main site's embedded distribution in sync as a separate reviewed release; do not hand-edit generated assets.
4. Verify the deployed same-origin `/shopify/api/*` routing, authenticated tenant separation, real billing settings, Stripe sandbox signup/portal and installed test-shop flow.
5. Complete browser/mobile/keyboard/visual acceptance and install-to-dispatch evidence. Source checks do not prove every page renders correctly or that live APIs communicate successfully.

Existing customer history is still browser-local and the broader customer/provider acceptance gates remain open. Team invitation/login implementation is not added in this batch. No live charge, refund, invitation, dispatch, production migration, merge or deployment is claimed.
