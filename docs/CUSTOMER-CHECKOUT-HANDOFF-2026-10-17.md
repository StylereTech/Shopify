# Customer checkout and retention handoff

## Implemented source scope

Customer routes now require a seven-day guest capability stored as a Secure, HttpOnly, SameSite=Lax `__Host-stylere_checkout` cookie. The database stores only its SHA-256 digest and a public guest UUID. Every owned request requires the captured `X-Stylere-Guest-Id`; every customer DTO echoes that owner. See `src/api/customer-session.ts` and migration `006_customer_checkout_ownership.sql`.

`POST /api/customer/session` creates/reuses a session; GET verifies it; DELETE revokes the captured session without clearing a newer shared cookie. Unsafe customer requests require JSON and an exact Origin in `CUSTOMER_ALLOWED_ORIGINS`. The app must use the same-origin `/shopify/api` proxy. Secure cookie forwarding through the deployed proxy still needs acceptance testing. Guest expiry does not imply data deletion or transfer of ownership to a replacement session.

Create uses a persisted client UUID `requestId`, a normalized payload fingerprint, and a unique guest/request pair. `GET /api/orders/requests/:requestId` recovers the original saved order. Reusing a UUID for changed fields returns409. Unknown historical and merchant-owned orders are never auto-assigned to guests. List, detail, tracking, chat, intent, and confirm all use guest scope.

Stripe charges the saved integer-cent quote, not a caller amount. A durable intent reservation and stable provider idempotency key prevent a refresh from creating another charge. Unknown initialization older than23hours requires reconciliation rather than issuing a fresh charge after provider idempotency expiry. Receipt validation requires exact stored PI, amount, currency, mode, guest, order, source, quote version, and amount received. Webhooks require the original raw body and signature; missing configuration fails closed. No development fake payment success remains. Automatic payment methods are enabled; Apple Pay availability/domain registration remains a live Stripe acceptance gate.

The current direct tariff remains the existing6.99/8.99 delivery fee,1.99 service fee and8% tax calculation (`src/domain/customer-checkout.ts`). This is a server-authoritative stored tariff, not proof of approved production pricing, tax treatment, retailer coverage, or a live delivery quote.

Delivery booking has a persisted state and lease. Unknown outcomes are looked up using a stable external delivery ID before another create. Provider map links are restricted to HTTPS DoorDash hosts. Tracking reports only recorded/observed state, never invented milestone times or a fabricated driver/ETA. Courier messaging has no transport in this repo: GET explicitly returns `available:false`; POST does not pretend the message was sent.

## Bounds and recovery jobs

- PostgreSQL pool:10connections,10s connection timeout,30s statement timeout,15s lock timeout,30s idle timeout (`src/infrastructure/db/postgres.ts`).
- Stripe:10s SDK network timeout with no automatic network retry;12s complete operation deadline, returning `PAYMENT_OUTCOME_UNKNOWN` and preserving the original reservation.
- DoorDash create/read/cancel:10s default deadline covers response headers and body, with an explicit timeout race even if a provider ignores cancellation.
- Guest history:maximum50rows/page. Tracking events:maximum32. Create:50items maximum, quantity1–100, notes1000characters.

Recovery dry-run: `npm run customer:dispatch-recovery -- --batch=20`.

Recovery apply: `npm run customer:dispatch-recovery -- --apply --batch=20`.

The job requires explicit `DATABASE_URL` and DoorDash configuration. It examines only paid, nonterminal, owned customer orders with pending/unknown booking or an expired60s claim; it never books unpaid/merchant records. Batch range1–100. A dry-run makes no provider call. Apply exits nonzero when selected bookings remain unresolved. Deploy a recurring job with no overlapping runs, bounded batches, and failure alerts. Having CLI source is not evidence that the deployed scheduler or provider integration works.

## Approved90-day retention: current enforceable scope

The user approved90days **after each order is completed**. `src/operations/customer-retention.ts` currently enforces this for guest customer checkout records only. It uses authoritative `completed_at`, `status='delivered'`, `payment_status='paid'`, and `dispatch_status='submitted'`. It excludes active, unpaid, uncertain, cancelled/failed, and completion-time-unknown records. No historical completion timestamp is inferred from `updated_at`.

Retention dry-run: `npm run customer:retention -- --batch=100`.

Retention apply: `npm run customer:retention -- --apply --batch=100`.

Batch range1–500; default is dry-run. Apply deletes the complete local `storree_orders` row and cascading checkout ownership/events/payment receipt. It retains only a guest/request UUID tombstone with retirement time, preventing the same expired request from being recreated. Logs contain counts, not customer payloads. Stripe and DoorDash retain their independent records; this process does not delete those external records. No hosted deletion or live scheduler was executed during this source audit.

Deploy migration006 before either job. A recurring retention job and monitored backlog/failure handling remain release gates. Customer-only implementation must not be presented as universal Shopify/merchant retention compliance.

## Merchant and Shopify retention: concrete dependencies

1. **Merchant standalone request replay.** `src/infrastructure/persistence/merchant-orders.ts` lines144–168 recovers and deduplicates using the retained order row. A purge needs an account/request UUID tombstone checked atomically on create/recovery. Current `merchant_record` creation is pending/unpaid and records a declared value; there is no authoritative completed-and-settled workflow to infer for those records.
2. **Shopify paid ingestion replay.** `src/domain/dispatch-orchestrator.ts` lines34–47 checks webhook idempotency and existing jobs by source order ID. Deleting a job without a persisted verified shop/source-order tombstone can allow recreation under a new webhook ID. Unknown historical shop domains must not be guessed.
3. **Database payload copies.** `src/infrastructure/db/migrations/001_initial_schema.sql` defines `webhook_events.payload_json` (full order JSON), `audit_logs.metadata_json`/correlation IDs, and `dispatch_attempts.job_id`; migration002 adds notification payloads and order IDs. Only deleting `delivery_jobs` leaves related customer data. The webhook payload is unnormalized TEXT without an authoritative order foreign key. A follow-up must persist verified shop/order linkage at ingestion and delete only attributable rows while preserving unresolved retries/outbox work.
4. **Redis queue and dead-letter payloads.** `src/infrastructure/queue/dispatch-queue.ts` enqueues the full order payload and copies failed messages to the configured dead-letter list. Safe retention requires indexed/normalized order ownership, an atomic purge/check protocol with the worker, and policy for active retry work. A Postgres-only purge cannot promise deletion of Redis copies.
5. **Notification and audit copies.** `src/infrastructure/notification-outbox.ts` stores delivery/customer notification payloads with no foreign-key cascade. Order completion does not establish that every pending notification or reconciliation item is resolved. Audit records use multiple entity types and correlation IDs, so substring matching of arbitrary JSON would risk deleting unrelated records.

These are release gates for extending the90-day policy to merchant and Shopify ingestion sources. They should be addressed as one cohesive normalization/tombstone/queue-retention change, then verified against isolated Postgres and Redis before deployment. Do not broaden the current purge with email, phone, or text-search heuristics.

## Verification limits

Focused route tests use controlled provider responses; isolated database tests use only the explicitly guarded loopback audit database. These checks do not establish live Stripe/Apple Pay domain acceptance, provider pickup coverage, deployed secrets/origin settings, scheduler operation, browser layout, cookie proxy forwarding, refunds, or courier chat transport.
