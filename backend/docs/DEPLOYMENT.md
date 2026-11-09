# Deployment preparation

This file records local Phase 12 preparation. No hosting account, domain, database, mail provider, monitoring service, or deployment has been configured.

## Render staging URLs

The owner supplied these staging origins:

- API: `https://invoiceflow-4rtb-x5so.onrender.com`
- App: `https://invoiceflow-frontend-2b0s-5149.onrender.com`
- Marketing: `https://invoiceflow-marketing.onrender.com`

The root [`render.yaml`](../../render.yaml) records the associated API CORS origin, frontend API base URL, marketing canonical/app URLs, React Router fallback, and static-site security headers. Review Render's Blueprint changes before applying them. Confirm the three existing services are updated rather than duplicated. The Blueprint does not contain database, Resend, JWT, or Cloudinary secrets.

If changing these values manually in Render, set `FRONTEND_ORIGIN` on the API, `VITE_API_BASE_URL` on the app Static Site, and `VITE_MARKETING_URL` plus `VITE_APP_URL` on the marketing Static Site; then rebuild the static sites. Configure the listed static security headers on their respective Render Static Sites. API security headers come from Helmet in the backend.

## Cost and environment boundary

The owner has requested free and open-source options. The specification permits free instances for staging only. It requires a paid MongoDB tier with point-in-time restore and always-on hosting for production, so production deployment cannot proceed under the current cost constraint. Do not place production data in a free staging service.

Staging may be configured after the owner selects providers and supplies the URLs and credentials. Use separate staging database, storage folder, billing mode, and secrets. Do not commit credentials or actual `.env` files.

## Transactional email with Resend

The backend supports `EMAIL_PROVIDER=resend` and sends account verification and password-reset mail through Resend's HTTPS Email API. Set `RESEND_API_KEY` and `DEFAULT_FROM_EMAIL` in the deployment environment; leave `EMAIL_URL` blank. The API key is a secret and must never be included in the frontend build or source control. The implementation uses Node's built-in `fetch`, so it does not add an npm dependency.

Before sending to real users, create a Resend account, add a domain you own, publish the exact DNS records shown in its dashboard, wait for verification, then create a sending-only API key scoped to that domain. Set `DEFAULT_FROM_EMAIL` to an address at that verified domain. Do not invent DNS record names or values; they are account- and domain-specific. For local development with no key, keep `EMAIL_PROVIDER=smtp` and `EMAIL_URL` blank to retain the local-only development-token flow. Resend's free-plan limits can change; check its current pricing before enabling a production sender.

## Staging smoke check

Once staging is configured, from `backend/` set these process variables to the public HTTPS endpoints:

- `STAGING_API_URL`: API origin, for example `https://api-staging.example.test`
- `STAGING_APP_URL`: app origin
- `STAGING_MARKETING_URL`: static marketing site origin
- `STAGING_APP_ORIGIN`: exact app origin, with no path

Then run `node scripts/deployment-smoke.mjs`. The script checks app and marketing HTML security headers, API health, the app-origin CORS preflight, and rejection of an unauthenticated customer request. It does not create or modify application records. It should only target the configured staging environment.

## Production gate

After the qualified accountant completes review, record the result in `docs/compliance/ACCOUNTANT_SIGNOFF.md` using the fields in `docs/compliance/ACCOUNTANT_SIGNOFF.template.md`. Run `node scripts/check-release-gate.mjs` before a production release. The gate verifies the recorded calculation version and PDF template version and hashes the relevant template source, state data, disclaimer, money formatting code, and bundled Devanagari font. A source change to those files requires a fresh review.

This gate verifies review metadata; it does not determine whether tax treatment is correct or replace the accountant's review.

## Remaining production readiness work

Before production, complete the specification's infrastructure and owner-controlled prerequisites: paid database with PITR and a successful restore drill, always-on hosting, isolated production secrets and storage, email DNS and deliverability, error and uptime monitoring, dependency and secret scanning, penetration test, migration rollback, legal copy approved by counsel, runbooks/status page, realistic load test, Razorpay live configuration, Cloudinary production configuration, accountant sign-off, and production URL smoke checks. Record the agreed RPO and RTO here after the owner selects the database tier and completes a restore drill.

No production rollback command is documented until the hosting/database provider is selected and its exact migration and restore procedures are verified.
