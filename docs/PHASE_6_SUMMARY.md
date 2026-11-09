# Phase 6: Payments

## Completed

- Added a tenant-scoped, append-only Payment ledger under `backend/src/modules/payments` with recorded and reversed states. Original payment facts cannot be edited or deleted; a single reversal records actor, time, and reason.
- Added invoice payment-history, payment-recording, and payment-reversal endpoints. Owner, admin, and accountant roles can record/reverse; invoice readers can view history. Foreign invoice/payment IDs return 404.
- Payment creation checks the outstanding invoice balance inside a MongoDB transaction. The transaction inserts the payment, updates `amountPaidMinor`, `balanceMinor`, and invoice status, writes the audit entry, and asserts the business currency lock.
- Partial and final payments derive `partially_paid` and `paid`. Reversals restore the balance and return status to `issued` or `sent` when no balance remains paid, preserving the original sent timestamp. Payment activity does not imply customer delivery.
- Payment record keys are unique per business and replay identical requests. Reusing a key with changed request details conflicts. Reversals use their own idempotency key and required reason.
- Added an invoice-screen payment history, record-payment form, outstanding balance display, and reversal form. Payments are manual ledger entries; InvoiceFlow does not collect money or invoke a payment processor.
- Updated root and backend documentation.

## Verification

- Backend suite: 99 tests pass across 13 files. Payment tests cover partial/final totals, overpayment, concurrent overpayment prevention, concurrent idempotent replay, reversal/idempotency, immutable facts, tenant isolation, and currency locking.
- Frontend suite: 23 tests pass across 7 files.
- Backend and frontend ESLint pass.
- Prettier checks pass for backend and frontend source and documentation.
- Dependency pin checks and forbidden-claims scan pass.
- Frontend production build succeeds; Vite reports the main-bundle size advisory (>500 kB).

Phase 6 is complete. Phase 7 has not started and requires the owner's approval.
