# Phase 11 security review

**Review type:** source and configuration review of the local repository plus automated integration/browser coverage. This is not an independent penetration test, deployment assessment, or certification.

## Controls observed

- Express security headers via Helmet, allowlisted CORS, request IDs, structured logging with redaction, request validation, and rate limits.
- Authentication uses short-lived access tokens, httpOnly refresh cookies, digested/rotating refresh tokens, reuse detection, password lockout, and bcrypt hashing.
- Tenant-owned routes use business context and permission checks. Integration coverage includes tenant isolation and owner/role behavior.
- Upload handling validates file type/signature and stores private receipts through the storage abstraction.
- Billing webhook verification and event deduplication are implemented; provider checkout is disabled until configuration is supplied.
- Browser E2E checks exercise auth flows, token handling, selected Phase 10 workflows, mobile shell, and axe checks.

## Findings and follow-up

| Finding                                                                                                                           | Risk/impact                                                                     | Required action                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No independent penetration test has been run.                                                                                     | Source tests do not establish resistance to real-world attack paths.            | Owner arranges the scoped independent assessment in `docs/PEN_TEST_SCOPE.md` before production approval.                                                                                                    |
| No production hosting configuration is committed for response headers, TLS, trusted proxy behavior, CORS domains, or secrets.     | Deployment-level controls cannot be verified from this local tree.              | Configure and verify these in Phase 12 for each environment; keep secrets out of source control.                                                                                                            |
| Dependency audit previously recorded moderate advisories in the pinned ESLint 10 toolchain; the approved spec pins were retained. | Development tooling advisories remain subject to updates and exposure.          | Re-run current advisory review during deployment preparation and address within the approved pin policy. CI runs exact pin checks and `npm ls`, but does not currently automate an advisory or secret scan. |
| Razorpay test checkout and webhook round-trip have not been exercised with provider credentials/plan IDs.                         | Provider integration behavior remains unverified against the real test service. | Keep checkout unavailable until owner-provided test credentials, webhook secret, and plan IDs are set and test-mode acceptance passes.                                                                      |
| Accountant validation is pending.                                                                                                 | Provisional calculation policy is not validated for production use.             | Arrange qualified accountant review and record the required sign-off before release.                                                                                                                        |

No secrets or `.env` values are included in this review. No external systems were probed. Reassess any finding when staging infrastructure exists.
