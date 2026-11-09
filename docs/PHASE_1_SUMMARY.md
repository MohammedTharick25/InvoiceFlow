# Phase 1: Foundation — work summary

## Implemented

- Rechecked all 66 package/version pins in specification sections 18.4, 18.5, and 18.7 with `npm view`, including peer dependencies and engine ranges. Selected and verified exact Step 0 pins for Razorpay, Cloudinary, migrate-mongo, and an OFL Noto Sans font for the PDF rupee glyph.
- Created hand-written backend, frontend, and marketing scaffolds. Added Node 22.22.2 engine declarations, `.nvmrc` files, strict npm install settings, exact package manifests, and lockfiles.
- Added Zod environment parsing, database connection setup, Express health endpoints, secure headers/CORS/rate limiting, request IDs, structured redacted logging, generic error handling, migration setup, and gitleaks configuration.
- Added shared BigInt money parsing and arithmetic, provisional GST calculations, HSN/SAC policy evaluation, configurable state and plan data, financial-year labels and bounded invoice-number formatting, injectable clock helpers, and CSV-injection protection.
- Added a Tailwind v4 frontend shell, one wrapped Radix dialog primitive, a separate static marketing shell, the required tax disclaimer, forbidden-claims scanner, terminology guard, parity fixtures, and clean-install CI jobs.

## Checks completed

- Registry: every existing specification pin and every selected Step 0 version resolved at the exact requested version.
- Clean installs: `npm ci` succeeded in backend and frontend. `npm ls --all` and `verify-pins` exited 0 in both apps. Both lockfile hashes remained unchanged through clean installs.
- Reproducibility: a second clean `npm ci` in each app produced an identical `npm ls --all --json` tree. The workflow also compares trees from separate GitHub Actions runners; that hosted job has not been triggered from this workspace.
- Backend: all 56 tests pass across nine files. The smoke checks cover env/Zod/bcrypt, health and request IDs, log redaction, Nodemailer JSON transport, PDF rendering with the rupee glyph, node-cron, Multer/CSV imports and CSV-injection protection. The replica-set transaction test passed after the owner installed the Microsoft Visual C++ runtime.
- Frontend: 10 Vitest tests pass. Vite production build, parity-fixture build, and marketing build succeed. The two Chromium checks pass, including axe on the main and tax-settings pages and browser execution of the shared financial fixtures.
- Static checks: backend and frontend ESLint and Prettier pass; forbidden-claims scan and dependency-pin verification pass.
- Audits: both lockfiles currently report four moderate ESLint 10 dependency-tree advisories. They are recorded in `DEPENDENCIES.md`; no unapproved version changes were made.

## Acceptance status

All Phase 1 acceptance checks were completed locally. The owner installed the Microsoft Visual C++ runtime, then `npm test` passed all 56 backend tests, including replica-set transaction commit and rollback. The GitHub Actions workflow is configured, but hosted CI has not been triggered from this workspace because it has no Git repository or remote.

The frontend Playwright tests pass against the built preview. On this Windows host the configured Playwright web-server runner leaves a Node child process open after reporting success; a manual preview plus `playwright.manual.config.js` exits cleanly with `2 passed`. To reproduce locally, run `npm run build`, `npm run build:parity`, and `npm run preview`, then run `npm run test:e2e:manual` in a second terminal. The regular CI workflow uses Playwright's managed server on Ubuntu.

Phase 2 has not started. Work stops here pending the owner's explicit approval.

## Service-cost preference update

After Phase 1 acceptance, the owner asked to avoid Sentry and review potentially paid hosted services. Sentry SDKs, initialization, DSN parsing, and DSN example variables have been removed. Razorpay and Cloudinary are still listed as SDK dependencies to preserve the approved Phase 1 architecture, but no Phase 1 code calls either service and their example credentials remain blank. See `DEPENDENCIES.md` for the service and cost review. No service account was connected or activated.
