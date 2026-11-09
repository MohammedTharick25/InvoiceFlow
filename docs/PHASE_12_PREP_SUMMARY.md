# Phase 12: local deployment preparation

Phase 12 has started with local, reviewable deployment preparation only. No hosting provider, domain, monitoring account, paid service, or deployment has been created or configured.

## Completed

- Added a staging smoke command that checks HTTPS app and marketing endpoints, security headers, API health, exact-origin CORS, and unauthenticated access denial. It performs only GET and OPTIONS requests.
- Added a production release gate that requires an accountant review record and validates its calculation version, PDF template version, and SHA-256 hash over the reviewed PDF source/data/font inputs.
- Added authentication email delivery through Resend's HTTPS API, with SMTP retained as an option. The API key remains an environment secret; no Resend account, sending domain, DNS record, or key has been configured.
- Added a sign-off template; it is deliberately not a completed review record.
- Documented the staging boundary, production prerequisites, and remaining owner/provider decisions in `backend/docs/DEPLOYMENT.md`.
- Added focused automated tests for the release gate and deployment smoke checks.

## Verification status

Backend verification completed: 19 test files and 130 tests passed; ESLint passed; Prettier passed; exact dependency pins passed; forbidden-claims scan passed. The release-gate CLI was also checked and correctly failed because `ACCOUNTANT_SIGNOFF.md` is absent. The staging smoke command cannot run against a real environment until the owner selects and configures HTTPS staging endpoints.

## Open Phase 12 gates

- Staging providers, hostnames, environment secrets, and deployment credentials are not configured.
- Resend still needs an owner-created account, a verified sending domain, and a sending-only domain-scoped API key before real account emails can be delivered.
- The owner requested free/open-source options. The specification restricts free instances to staging and requires paid MongoDB point-in-time recovery plus always-on production hosting. Production deployment therefore cannot proceed within that constraint.
- A qualified accountant has not completed the review. No one has been contacted or represented as having approved the tax policy.
- Production backup/restore drill, email DNS, monitoring, pen test, legal approvals, load test, Razorpay live configuration, Cloudinary production configuration, production smoke tests, and owner acceptance remain outstanding.

This is preparation progress, not Phase 12 acceptance. Stop here until the staging setup decisions are provided; production also requires the documented owner-controlled gates.
