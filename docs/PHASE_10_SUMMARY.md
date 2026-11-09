# Phase 10 summary

**Status: complete locally.** This phase contains only the owner's selected Tier 2 features: cash-flow overview, customer CSV export, PDF report exports, customer duplicate warnings, sample data, and recurring expenses. Receipt uploads were already completed in Phase 7. No packages or paid services were added.

## Delivered

- **Cash flow:** report endpoint and Reports screen show six business-local months of received, recorded payments and active expenses, separated by currency and rendered in currency-aware amounts. The King-only `cashflow` entitlement gates access. Invoice values are not counted as received funds.
- **Customer CSV:** Anointed/King `fullExport` plans can export active customer billing and shipping details, GSTIN, contact information, notes, and reminder preference. Output is tenant-scoped, formula-injection guarded, private/no-store, and capped at 50,000 rows.
- **PDF reports:** Sales, payments, outstanding, overdue, and customer-balance reports can be downloaded as PDFs. They reuse report validation and tenant filters, apply the 50,000-row cap, and stream without storing report documents.
- **Duplicate warnings:** Customer entry checks normalized phone, email, GSTIN, and exact case-insensitive name matches. It warns before saving and lets the user continue, so legitimate similar customers are not blocked.
- **Sample data:** An owner can add two clearly labeled `.invalid` sample customer contacts once, only while the workspace has no customers, invoices, or expenses. The transaction and activity log keep the operation auditable. No sample financial records are created, so the action cannot create false balances or lock currency.
- **Recurring expenses:** Owners/admins/accountants with the expenses entitlement can create, edit, pause/resume, and archive weekly or monthly rules. The worker runs at startup and every 15 minutes. A generated expense and its rule advancement commit transactionally; a unique rule/date index prevents duplicate postings. Expired/read-only workspaces hold due entries until write access returns. Missing categories or a currency mismatch pause the rule.

## Acceptance checks

- Backend integration coverage: duplicate matches and sample-data guardrails; cash-flow reconciliation; customer CSV tenant and formula-injection checks; all five PDF report types; separate plan gates; recurring schedule creation, monthly date clamping, rule edits and pause, transaction/idempotency, and read-only entitlement behavior.
- Frontend coverage: currency-formatted cash flow; duplicate warning with an explicit continue action; shared exact-money parser on recurring rule creation.
- Full backend suite: 17 files, 122 tests passed. Full frontend suite: 10 files, 29 tests passed. Frontend production build passed. Changed-file ESLint checks, both package-pin verifiers, and the forbidden-claims scan passed.
- Package pins and dependency lockfiles were not changed for this phase.
- Added a reversible database migration for the recurring occurrence uniqueness and scheduler indexes. Apply it with the documented `migrate-mongo up` command before deploying Phase 10 to an existing database.

## Scope boundary

Customer email, team invitations, owner TOTP, and the support console remain unselected. Phase 11 and later work has not started. Phase 9A Razorpay test-mode acceptance remains pending owner test credentials, webhook secret, and provider plan IDs; this separate gate was not changed here.
