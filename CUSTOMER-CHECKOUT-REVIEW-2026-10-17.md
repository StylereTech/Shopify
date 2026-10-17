# Customer checkout review — October 17, 2026

## Scope and status

This follows the merchant source repairs in draft PR #3 and the continuing Style.re all-page audit. SH-02–SH-09 cover delivery entry, addresses, summary, payment, confirmation, tracking, history and chat. Support and legal page copy is aligned with the user's approved retention period: **90 days after each order is completed**.

The source changes are under verification. They have not been merged or deployed. The user deferred browser testing; source callbacks, mocked providers and a disposable local PostgreSQL database do not establish rendered or live-provider acceptance. No charge, refund, delivery, hosted migration or production deletion is part of these tests.

## Findings and repairs

The previous public order routes had no customer ownership boundary. Payment initialization accepted a browser-supplied amount; confirmation did not bind the Stripe receipt to the saved order, quote, currency and payment intent. Missing provider configuration could produce apparent success. Order creation ran inside a read query, history was browser-local, and interrupted requests lacked durable recovery.

The replacement uses a random guest capability in a Secure, HttpOnly, SameSite=Lax, host-only cookie. PostgreSQL stores its SHA-256 hash. JavaScript sees only the public guest UUID, and every owned request supplies that captured UUID so a changed cookie cannot retarget a request silently. Unsafe requests require JSON, an exact configured Origin, and a compatible Fetch Metadata value. No historical ownership is inferred from an email, phone number or known order ID.

Creation reserves a UUID and frozen payload in browser storage before POST. Server uniqueness and a canonical payload fingerprint make repeat requests return the same owned order. A failed or interrupted response stays unresolved until recovery verifies it. A new draft cannot replace an unresolved request. Receipt, draft revision and guest identity must match before the UI advances.

The backend owns pricing and Stripe initialization. It persists the intent reservation, reuses its idempotency key, and checks the saved intent, metadata, amount, currency, mode and amount received. An uncertain initialization older than the supported retry window requires reconciliation. Signed Stripe webhooks use the raw body. A paid order can still have a pending delivery booking; those states are presented separately.

Customer pages use Payment Element and conditional Express Checkout wallets. They retrieve the saved order and intent on recovery, use a shared synchronous submission lock, and require an authoritative server receipt for paid confirmation. Available methods still depend on Stripe configuration, supported devices and domain registration. This source does not prove Apple Pay acceptance.

History comes from scoped server pagination. Tracking distinguishes recorded state, live provider observations and unavailable provider updates, and only exposes an approved HTTPS DoorDash tracking destination. Courier chat is shown as unavailable until an actual courier messaging transport exists. It does not falsely report a message as sent.

The customer shell, forms and pages share a warm-white, ink and orange palette with associated labels, visible focus and responsive source rules. Customer Home/New Delivery links lead to the customer entry. Query parameters preserve order and history context. Generic moving-courier claims and an application link mislabeled as a live courier map are removed.

## Retention boundary

The approved period starts at each order's authoritative completion time. Migration 005 captures future delivered transitions without inventing historical completion dates. The customer retention job selects only completed, paid, submitted customer deliveries older than 90 days, and excludes active, unresolved and unowned history. It deletes the local order and its customer checkout payload/receipt; a minimal guest/request replay tombstone prevents recreation of the retired request. External provider records are outside this job.

This executable cleanup currently covers the direct customer checkout source. Merchant records and Shopify delivery ingestion also have webhook, outbox, audit and queue copies. They require normalized attribution, replay protection and coordinated cleanup before the approved policy is fully enforced. The retention policy must not be described as already operational across all Shopify data. See the [backend retention coverage handoff](docs/CUSTOMER-CHECKOUT-HANDOFF-2026-10-17.md) for the exact remaining dependencies.

## Release sequence and required evidence

1. Review the coordinated backend/frontend change, apply migrations through 006 to the correct environment, and verify the rollback procedure. This audit applies migrations only to an isolated disposable local database.
2. Configure `CUSTOMER_ALLOWED_ORIGINS` with exact HTTPS customer origins. Configure the intended Stripe mode, webhook secret, DoorDash credentials and verified pickup contact. Keep secrets on the server. The checkout fails closed when its dependencies are missing.
3. Verify same-origin `/shopify/api/*` proxying, including Secure cookie forwarding, raw signed webhook handling and tenant separation. Local HTTP development does not establish production cookie behavior.
4. Validate the current direct tariff and quote estimates against the approved commercial policy before production enablement. The source still uses the existing fixed direct tariff and tax calculation; it does not establish a nationwide tax or real-time delivery quote policy.
5. Publish the tested frontend source and backend together. Synchronize the main site's embedded Shopify distribution in a separate reviewed release; generated assets are not hand-edited or committed in this source batch.
6. Schedule bounded dispatch recovery with the same backend environment: `npm run customer:dispatch-recovery -- --batch=20` for dry run and `npm run customer:dispatch-recovery -- --apply --batch=20` for reviewed apply. The apply mode may contact the real delivery provider and must run only in its intended environment. Alert on unresolved results and reconcile the stable external delivery ID before creating another delivery. Prevent overlapping scheduled runs.
7. Schedule customer retention at least daily with the same database environment. Dry run: `npm run customer:retention -- --batch=100`. Reviewed apply invocation: `npm run customer:retention -- --apply --batch=100`. Repeat bounded batches if the backlog exceeds the limit, record counts rather than customer data, and alert on nonzero exits. No production schedule or purge was installed here.
8. Complete merchant/Shopify ingestion retention separately, then test every attributed storage copy and replay boundary. Do not infer attribution or deletion dates from ambiguous legacy data.
9. Complete browser/mobile/keyboard/visual tests and Stripe sandbox card/wallet/redirect acceptance, webhook retries, provider booking/recovery, guest expiry and cross-tab behavior. Then verify the production configuration using the approved release process. The seven-day guest capability is a browser-session access mechanism; it is not a permanent account history credential.

## Verification record

The consolidated Vitest regression passed **146 checks**; 17 environment-gated database cases were skipped in that run. A separate current isolated PostgreSQL gate passed **8 customer cases**, including migration, ownership, concurrent idempotency, UTC timestamps, unique intent/rollback, revocation, retention and dispatch recovery. The 9 merchant database cases among the skipped group belong to the preceding PR #3 evidence and are not counted as newly run here.

All **64 Node page/callback checks** passed, including 21 customer cases and the existing 43 merchant cases. These execute callbacks and controlled responses; they do not run a browser. Together with the current database gate this batch has **218 distinct passing checks**.

Backend typecheck and build passed. Frontend lint, TypeScript and the final production build passed: 129 modules, 6.82 seconds. Generated backend/frontend output is excluded from the source commit. The whitespace check passed. Browser and live-provider checks remain outstanding.
