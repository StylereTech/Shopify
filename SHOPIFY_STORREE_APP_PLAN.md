# Shopify Storree App Plan

## Current Repo Audit
- Repository contains only a minimal README and no existing Storree 1.1 source code artifacts.
- No delivery logic, dispatch engine, serviceability calculators, API clients, database models, or webhook processors are currently present.
- Because source-of-truth code is absent, this implementation establishes a clean baseline architecture and extraction-ready domain layer aligned to the requested target capability.

## Delivery Product Scope
1. Merchant onboarding via Shopify OAuth and Storree account linking.
2. Merchant delivery configuration (pickup, radius, windows, fees, enablement).
3. Checkout delivery rates for one-hour and same-day.
4. Paid-order ingestion and idempotent dispatch orchestration.
5. Delivery lifecycle persistence and status transitions.
6. Exception handling and operational observability.
7. Deployment-ready runbooks and environment contract.

## Iterative Build Plan
- Cycle 1: Audit + planning docs + target architecture.
- Cycle 2: Shared delivery domain and pricing/serviceability modules.
- Cycle 3: Shopify backend scaffolding (carrier service endpoint + webhook endpoint).
- Cycle 4: Dispatch orchestration with idempotency and status persistence abstractions.
- Cycle 5: Tests for core business-critical flows.
- Cycle 6: Deployment and merchant setup documentation.

## Acceptance Mapping
- Checkout offering: `/shopify/carrier-service/rates`.
- Order-to-dispatch: `/shopify/webhooks/orders/paid` -> `DispatchOrchestrator` -> `StorreeClient`.
- Lifecycle model: quoted/pending/accepted/driver_assigned/... tracked in domain type contracts.

## Known Gap
- Full production dependencies (real DB, OAuth handshake, Shopify session storage, HMAC verification, and real Storree API credentials) still require environment-specific implementation.
