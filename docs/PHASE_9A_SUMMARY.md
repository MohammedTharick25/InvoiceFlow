# Phase 9A: Billing and entitlements

## Delivered

- Added a registry-driven Basic, Anointed, and King plan matrix with monthly invoice and customer limits, team limits, and feature flags.
- Added a 14-day, no-card trial, subscription states, a seven-day past-due grace period, end-of-period cancellation, and read-only behavior after expiry or halt.
- Added server-side feature, write, and capacity gates; plan limits are checked during finalization and customer creation. The existing invoice-finalization transaction keeps sequence numbers gap-free when concurrent requests hit the limit.
- Added Razorpay subscription checkout/change/cancel, signature-verified checkout confirmation and webhooks, event deduplication, stale-event fencing, provider invoice history, and in-app trial notices.
- Added owner billing UI, plan/usage display, confirmation for cancellation, and a full business-data JSON export that remains available in read-only state.
- Kept Razorpay plan IDs blank until the owner creates provider plans. The application makes no provider request without configured plan IDs and secrets. Payment collection for customer invoices is still manual ledger recording; InvoiceFlow does not collect those funds.
- Updated the backend example MongoDB URI to a local replica-set example; no credentialed URI should be committed.

## Provider and cost status

Razorpay is an optional third-party integration; this code does not promise that its account, transaction, or settlement fees are free. No Razorpay account credentials or plan IDs were configured for this phase, and no live or test checkout was performed. Until the owner configures Razorpay test credentials, webhook secret, and plan IDs, checkout stays unavailable. All local tests use a replica-set test database and a fake provider client.

## Verification

- Backend: 17 test files, 119 tests passed. The onboarding trial uniqueness check was rerun after adding a second-onboarding attempt: 1 file, 16 tests passed.
- Frontend: 9 test files, 26 tests passed; ESLint passed.
- Backend and frontend ESLint passed; backend dependency pin verification passed; forbidden-claims scan passed.
- Frontend production build passed. Vite reports the main JavaScript chunk at 578.53 kB, above its 500 kB advisory threshold.
- Local billing tests use `MongoMemoryReplSet` and an injected fake provider. The Razorpay test-mode end-to-end checkout/webhook acceptance criterion is **pending** because no Razorpay test credentials, webhook secret, or provider plan IDs are configured. Checkout remains disabled until those values are supplied.
- `npm view razorpay@2.9.8 ...` could not be completed in this environment: the npm launcher is blocked by its NVM trust guard, and invoking its CLI directly did not return from the registry request. No package version was changed or substituted.

Phase 9A is implemented locally but is not marked complete until the Razorpay test-mode flow is verified. Phase 9B was started after the owner's explicit approval; see `docs/PHASE_9B_SUMMARY.md`. No phase after 9B has started.
