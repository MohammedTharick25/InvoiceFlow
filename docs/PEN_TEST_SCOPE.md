# InvoiceFlow penetration-test scope

## Objective

Have an independent tester assess the application’s authentication, authorization, tenant isolation, input handling, file handling, and billing integration before production use. The owner arranges and authorizes the tester; no test has been performed under this document.

## In scope after staging is provisioned

- Staging web application and API endpoints owned by InvoiceFlow.
- Registration, email verification, login, password reset/change, refresh, logout, session revocation, lockout, and rate limiting.
- Business/workspace membership and role permissions, including cross-tenant object references and attempts to inject tenant identifiers.
- Customer, invoice, payment, expense, recurring-expense, report, and file/receipt routes; validation, export injection, IDOR, and access-control checks.
- Upload type/signature validation, storage access controls, and private file delivery.
- Billing entitlement enforcement and Razorpay test-mode callback/webhook verification, only after test credentials and isolated test plans are configured.
- Browser security headers, CORS, cookie flags, TLS, and deployment configuration once staging exists.

## Exclusions and safeguards

- Production, real customer data, destructive operations, denial-of-service/load attacks, social engineering, physical access, and third-party infrastructure are excluded unless separately authorized in writing.
- Never submit real card data or initiate live-mode payments. Razorpay testing is limited to the owner’s test account.
- Use synthetic accounts/data. Coordinate rate limits and test windows with the owner. Stop and report immediately if real data, secrets, or service instability is encountered.

## Deliverables

Request a written report with scope, dates, tester qualifications, methodology, severity-ranked findings, reproducible evidence with sensitive data redacted, remediation recommendations, retest results, and residual-risk statement. Track findings to closure before release decisions. This scope is a preparation document, not authorization to test a live service.
