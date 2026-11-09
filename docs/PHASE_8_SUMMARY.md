# Phase 8: Reminders and notifications

## Delivered

- Persistent, business-scoped reminder schedules with business-timezone scheduling at 09:00 and the default three-days-before, due-day, and three-days-after rules.
- Startup, one-minute, and request-driven idle sweeps with database job leases, fencing, recovery, run history, and a manual run-now endpoint.
- Deduplicated, per-user in-app notifications and a reminder health/status view.
- Reconciliation on invoice finalization, due-date and schedule changes, payment completion, and invoice archive.
- Owner/Admin reminder settings with an exact pending-row confirmation before disabling. Re-enabling starts a new eligibility window and does not reopen cancelled reminders.
- Tenant and user scoping, paid-balance eligibility, stale-reminder handling, and transaction fences around concurrent disable/payment changes.

Customer email reminders were not selected for this phase. No SMTP service, paid monitoring, or external reminder transport is configured or contacted.

## Verification

- Backend full suite: 15 files and 108 tests passed.
- Frontend full suite: 8 files and 24 tests passed.
- Backend and frontend ESLint and Prettier checks passed for the Phase 8 implementation.
- Frontend production build succeeded. Vite reports the main JavaScript bundle at approximately 568 kB, above its 500 kB advisory threshold.

Phase 8 is complete. Stop here and wait for owner approval before Phase 9.
