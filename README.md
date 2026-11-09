# InvoiceFlow

InvoiceFlow is a JavaScript application for organizing invoices and business records. The completed local roadmap through Phase 10 provides the app foundation, authentication and onboarding, invoices, customer and payment records, expenses, reminders, reports, selected Tier 2 workflows, billing entitlements, and a static landing page.

## Requirements

- Node.js 22.22.2 or later on the 22.x line
- npm (use the exact versions in each app lockfile)
- MongoDB replica set for transactional application work; integration tests use `MongoMemoryReplSet`

## Local setup

Install the backend and frontend from their lockfiles:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
npm test
```

Set a local replica-set `MONGODB_URI` before booting the API. In a second terminal:

```powershell
cd frontend
npm ci
npm test
npm run build
```

The marketing site is a separate static site in `marketing/`. Build it from `frontend/` with `npm run build:marketing` and check it with `npm run test:e2e:marketing`. It reuses the frontend's pinned toolchain without third-party trackers; configure real site/app domains and owner-provided footer details before deployment.

## Tax information

InvoiceFlow organizes invoice and tax information you configure. It does not file GST returns, give tax advice, or guarantee compliance. Review with a qualified accountant.

Tax rates and HSN/SAC policies are configurable starting points. The `gst-calc-v1` calculation policy is provisional pending accountant review. Passing tests show the code follows the written arithmetic policy; they do not validate a tax treatment for a real transaction.

## Phase status

Phases 1 through 10 are implemented locally. Phase 11 QA artifacts and Phase 12 local deployment preparation are documented in [the Phase 11 summary](docs/PHASE_11_SUMMARY.md) and [the Phase 12 preparation summary](docs/PHASE_12_PREP_SUMMARY.md). No staging or production service is configured and no deployment has been made.

Phase 9A billing and entitlement code is tested locally; Razorpay test-mode acceptance remains pending test credentials, webhook secret, and plan IDs. The provisional calculation policy has not been reviewed by a qualified accountant; production remains blocked pending review and release gate. The specification requires paid production infrastructure, while the owner requested free/open-source options, so this work is limited to local preparation and can only move to staging after provider choices and credentials are supplied. See the [Phase 9 summary](docs/PHASE_9_SUMMARY.md), [Phase 9A summary](docs/PHASE_9A_SUMMARY.md), [Phase 9B summary](docs/PHASE_9B_SUMMARY.md), and [Phase 10 summary](docs/PHASE_10_SUMMARY.md).
