# Phase 4: Customers

## Completed

- Added the Customer model, tenant-first active/name index, tenant-scoped text index for name and email, strict Zod schemas, customer service, and routes under `backend/src/modules/customers`.
- Added create, list/search/paginate, read, partial update, and soft-archive endpoints at `/api/customers`.
- Reused the existing authentication, tenant context, `businessId` body rejection, and customer permission middleware. Owner/admin can write; accountant can read. Foreign customer IDs return 404.
- Validated customer billing and shipping state codes against the configured reference file. GSTIN is normalized to uppercase and format-checked; its prefix must match billing state on create and updates. This validates format only; there is no government registry lookup.
- Added customer integration coverage for CRUD, text search and pagination, archive behavior, GSTIN/state validation, strict input, authentication, accountant read-only permissions, and IDOR in both tenant directions.
- Documented the endpoints and permissions in `backend/README.md`.

## Scope note

This phase delivers the customer backend API. The Customers view in the frontend shell remains a placeholder because the browser login/token flow has not been implemented yet; no client-side credential persistence was introduced to work around that gap.

## Verification

- Customer integration tests: 7 passed.
- Full backend suite: 79 tests pass.
- Backend lint, formatting, dependency pins, and forbidden-claims scan pass.

Phase 4 is complete. Phase 5 has not started and requires the owner's approval.
