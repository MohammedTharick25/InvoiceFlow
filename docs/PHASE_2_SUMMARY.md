# Phase 2: Auth and onboarding

## Implemented

- Added User, RefreshToken, AuthToken, Business, BusinessMembership, BusinessSettings, ExpenseCategory, TaxRate, TaxRateHead, Subscription, and append-only ActivityLog models with the specified unique and TTL indexes.
- Added registration, email verification, login/logout, refresh rotation with family reuse detection, password reset/change, profile and email change/re-verification, active-session listing/revocation, account lockout, strict request validation, and auth rate limiting.
- Access tokens are short-lived JWTs. Refresh tokens are opaque, HMAC-hashed in MongoDB, rotated on use, and kept in HttpOnly, SameSite=Strict cookies. Authentication checks the backing session so logout and family revocation take effect immediately.
- New passwords use bcrypt cost 12 and a Have I Been Pwned k-anonymity range lookup. Only the first five SHA-1 hash characters are sent. The API failure path is closed; no password or full hash is sent.
- Added production configuration checks requiring a configured email sender and non-example JWT secrets. Local development with no SMTP sender returns verification/reset tokens in the local API response only; tokens are not logged.
- Added transactional business onboarding with verified-email and one-trial-per-user checks, the one-active-business partial unique index, owner membership, INR default, configurable currency, 14-day King trial metadata, reminder `enabledSince`, default expense categories, and three editable, non-authoritative tax-rate seeds plus heads. No reminder schedule was invented; onboarding leaves it empty for the reminders phase to configure.
- Added tenant context from the signed membership claim, request-body `businessId` rejection, permission middleware, owner/admin/accountant matrix and configurable staff grants.
- Added owner-only currency changes with `currencyVersion`, lock enforcement, amount-holding draft refusal, amount-free draft currency updates, and an append-only audit event.
- Sentry and GlitchTip remain absent. This phase does not contact Razorpay or Cloudinary.

## Verification

- Backend ESLint and Prettier pass.
- Full backend suite: 10 files and 72 tests pass, including 20 parallel onboarding attempts yielding one business, a forced pre-commit failure leaving no onboarding records, refresh-token reuse revocation, password flows, sequential and concurrent lockout, tenant isolation, currency review/lock behavior, slot-two index behavior, and tax seed checks.
- Dependency pins and forbidden-claims scans pass.

## Notes

- With `EMAIL_URL` blank in development, the API returns verification/reset links as `developmentToken` values so local auth can be exercised without an SMTP account. Production rejects this configuration.
- The breached-password check requires network access to the free Have I Been Pwned range endpoint; it sends only the five-character hash prefix. It is not an open-source self-hosted database.
- Currency draft checks bind to the Invoice model when that model is introduced in the invoice phase. The Phase 2 integration suite uses a minimal fixture model to exercise the contract. Finalize, payment, and expense services must set `Business.hasFinalizedRecords` transactionally in their later phases.
- No frontend registration/onboarding screens were added; Phase 2 delivers the backend API and Phase 3 begins the app shell/UI work.

Phase 3 began only after the owner approved the next phase; its completion record is in `docs/PHASE_3_SUMMARY.md`.
