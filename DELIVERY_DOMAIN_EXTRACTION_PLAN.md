# Delivery Domain Extraction Plan

## Objective
Build a reusable delivery domain layer that can be consumed by Shopify adapters and future channels.

## Target Domain Modules
- `src/domain/types.ts`: canonical contracts for configs, quotes, jobs, statuses.
- `src/domain/serviceability.ts`: geofence/radius and time-window eligibility.
- `src/domain/pricing.ts`: fee and ETA logic for one-hour and same-day.
- `src/domain/dispatch-orchestrator.ts`: order ingestion and dispatch lifecycle coordination.

## Extraction Boundaries
- **Pure domain logic**: no web framework dependencies.
- **Infrastructure adapters**: repository interfaces and Storree API client abstractions.
- **Channel adapters**: Shopify rate callback + webhooks.

## Migration Strategy
1. Keep interfaces stable (`MerchantConfigRepository`, `DeliveryJobRepository`, `StorreeClient`).
2. Start with in-memory adapters for local validation.
3. Replace adapters with Postgres/Redis/real Storree HTTP clients incrementally.

## Non-Functional Requirements
- Deterministic idempotent order processing.
- Explicit typed contracts.
- Auditable status updates.
- Test coverage for serviceability, pricing, and webhook orchestration.
