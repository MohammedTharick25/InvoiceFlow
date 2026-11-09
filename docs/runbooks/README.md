# Operational runbooks (pre-deployment drafts)

These procedures are local preparation only. Phase 12 must replace placeholders with the chosen host, database, on-call contacts, secrets process, and verified commands. Do not run production commands copied from these drafts without adapting and reviewing the environment.

## Start locally

1. Install the documented Node 22.22.2 runtime and the exact lockfile dependencies with `npm ci` in `backend/` and `frontend/`.
2. Copy each `.env.example` to a private `.env`; set a local MongoDB replica-set URI and strong local-only auth secrets. Do not commit `.env` files.
3. Start the API from `backend/` with `npm run dev`; start Vite from `frontend/` with `npm run dev` in a second terminal.
4. Confirm `GET /health`, then run backend/frontend unit checks and browser checks before changes are accepted.

## API or database unavailable

1. Capture time, request ID, endpoint, status, and sanitized logs; never paste tokens, cookies, passwords, or customer data into an issue.
2. Check API process health, MongoDB availability, replica-set status, URI/database name, and connection errors.
3. For local development, stop and restart only after recording the error. For staging/production, use the host-specific restart/rollback process and page the configured operator.
4. Verify health, auth, tenant-scoped read, and transaction-dependent write paths with synthetic data after recovery.

## Reminder scheduler backlog

1. Check reminder health/status, scheduler logs, database connectivity, and worker lease/lock expiry.
2. Avoid manually editing reminder logs or retrying uncertain email sends; the product does not enable customer reminder email by default.
3. Restore service through the deployment process, then confirm due/unprocessed and failed counts recover without duplicate delivery records.
4. Record duration, affected synthetic/test records, and remediation. Configure alert thresholds and operator contacts during deployment.

## Suspected data loss / restore

1. Stop writes using the host’s incident procedure and preserve logs/metadata.
2. Identify the latest known-good backup and its encryption, age, and integrity status. Do not overwrite the source database.
3. Restore into an isolated environment first; verify record counts, tenant boundaries, indexes, and auth access.
4. Obtain owner approval for recovery point and recovery time, then perform the host-specific production restore.
5. Reconcile writes since the backup and document customer notification decisions with counsel.

## Razorpay webhook or billing discrepancy

1. Keep live checkout disabled until test and release gates are satisfied. Do not disclose or log provider secrets/signatures.
2. Inspect sanitized webhook request ID, signature-verification result, dedupe/event status, and subscription timeline.
3. Use the provider dashboard and application state to reconcile the event; never mark payment complete manually based only on a browser redirect.
4. Test corrections in provider test mode with synthetic subscriptions, then document the resolution.

## Deploy and rollback (host-specific steps pending)

1. Confirm release checklist, claims scan, tests, dependency review, migration plan, backup/restore drill, domains/CORS/security headers, and secrets.
2. Deploy to staging first; run smoke tests and observe logs/alerts. Production requires accountant sign-off and release gate.
3. If smoke checks fail, follow the selected host’s immutable-release rollback procedure. Do not run ad hoc database downgrades; migrations need a reviewed forward-fix or tested restore plan.
4. Verify health, login/logout, tenant isolation, invoice/PDF, reports, and billing state after rollback or redeploy.
