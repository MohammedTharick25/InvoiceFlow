# Phase 11: MVP QA

## Delivered

- Added Playwright coverage for register/verify/login/onboard/refresh/sign-out and token handling; an invoice browser journey through GST draft/HSN, place-of-supply and reverse-charge confirmations, finalize, PDF download, manual sent/unmark, and partial/final payment; customer duplicate warnings; cash-flow, CSV/PDF downloads; recurring-expense creation; explicit sample-contact action; shell/mobile behavior; and axe checks. Fixed a dark-theme notification contrast issue and made unstable navigation selectors exact.
- Added Business settings currency changes with an explicit confirmation and amount-clearing flow for priced drafts. Invoice details now display the saved taxable value and tax components, including IGST. Browser coverage checks currency-change retry, reminder disable/re-enable, inter-state IGST display, and the full invoice lifecycle.
- Replaced the tax-settings placeholder with an owner-only append-only rate-version screen. The E2E suite appends a future rate and confirms an existing invoice still displays its stored rate; backend integration also verifies the persisted invoice snapshot is unchanged.
- Added a backend integration regression test proving a later effective-dated tax-rate version does not mutate an already-finalized invoice snapshot.
- Added a 1,000-record tenant-scoped sales CSV report integration load check with output completeness and a broad 10-second local guard. The check is reproducible in `backend/tests/reports.test.js`.
- Generated four synthetic PDF examples with the current financial calculation and PDF renderer: intra-state mixed rates/discount/charge, inter-state IGST, non-taxable categories, and `other` supply type. Regenerate using `node backend/scripts/build-review-samples.mjs`.
- Prepared [`docs/compliance/REVIEW_PACK.md`](compliance/REVIEW_PACK.md) for a qualified accountant, including calculation policy, fixed worked examples, HSN and numbering notes, sample PDFs, and a review checklist.
- Added source-level security findings, a penetration-test scope, pre-deployment runbook drafts, and a privacy/legal review checklist. None claim an independent test or legal/accounting approval.
- Updated the root README to mark local Phase 11 work and state that Phase 12 has not started.

## Verification evidence

- Backend: 17 test files, 124 tests passed, including the 1,000-invoice report test and finalized-rate-snapshot regression.
- Frontend unit: 10 test files, 29 tests passed.
- App Playwright: 15 tests passed, including axe, mobile, currency, reminder, inter-state tax display, tax-rate snapshot, and invoice lifecycle checks.
- Marketing Playwright: 2 tests passed.
- Backend/frontend ESLint, direct pin verification, and forbidden-claims scans passed. App, parity, and marketing production builds passed. The main app JavaScript bundle is 597.65 kB (gzip 184.04 kB), above Vite 500 kB advisory threshold; parity and marketing bundles are within the threshold.
- Windows `npm` invocation is blocked by the local NVM trust guard, so verification used the already-installed package entry points with Node directly. No NVM trust settings or dependency pins were changed.

## Pending release gates and limits

- The owner must arrange the qualified accountant required by Specification Section 22.16. No reviewer has been assigned or contacted by this work. Production must wait for the completed `docs/compliance/ACCOUNTANT_SIGNOFF.md` and matching release gate.
- Razorpay test-mode checkout/webhook acceptance remains pending test credentials, webhook secret, and plan IDs (see Phase 9A). Billing checkout remains unavailable without them.
- The remaining Section 17.7 external browser scenario is trial-to-Razorpay-test-checkout/downgrade; it requires owner-provided test credentials, webhook secret, and plan IDs.
- The security review is source/configuration review only. No independent penetration test or deployed-host security assessment was performed.
- Hosting/domain security headers, secret management, backups/restore drill, uptime and alerting, real privacy notice/terms, legal copy approval, and external provider setup require owner input and belong to Phase 12.
- Vite reports the main app bundle above its 500 kB advisory threshold. Production performance and infrastructure load remain to be measured on representative deployment hardware; the local report check is only a preliminary database/report baseline.

Phase 11 local QA artifacts and the accountant handoff pack are prepared, but Phase 11 is not declared complete while Razorpay test-mode acceptance and the Section 22.16 reviewer arrangement/handoff remain open. Phase 12 has not started and requires a separate explicit owner approval after Phase 11 acceptance.
