# Phase 9: Reports and dashboard

## Delivered

- A tenant-scoped dashboard for current-month finalized invoices, outstanding and overdue balances/counts, active customers, and recent issued invoices.
- CSV exports for sales, recorded payments, outstanding invoices, overdue invoices, and current customer balances.
- Optional calendar-date filters for sales, payment, outstanding, and overdue reports; exports cap at 50,000 rows.
- Server-side report-role authorization, tenant filters, private/no-store download responses, and CSV formula-injection protection.
- Money totals remain integer minor units in API responses and CSVs. Payment exports omit reversed ledger entries, and balances reconcile to invoice balance fields.
- Dashboard and Reports navigation and views connected to the API. Reports remain governed by server-provided entitlements when the billing phase supplies them.

## Verification

- Backend full suite: 16 test files and 110 tests passed.
- Frontend full suite: 8 test files and 25 tests passed.
- Backend and frontend ESLint and Prettier checks passed for the Phase 9 implementation.
- Frontend production build succeeded. Vite reports the main JavaScript bundle at approximately 572 kB, above its 500 kB advisory threshold.
- The report integration tests cover dashboard reconciliation, tenant filtering, all five CSV endpoints, date validation, role authorization, and formula-injection escaping.

Phase 9 is complete only after the verification results above are updated. Stop here and wait for owner approval before Phase 9A.
