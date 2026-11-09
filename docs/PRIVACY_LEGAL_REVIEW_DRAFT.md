# Privacy and legal review draft

**Status:** internal issue checklist for owner and qualified counsel. This is not a privacy notice, contract, tax advice, or legal conclusion. Do not publish as customer-facing legal copy until counsel supplies and approves the final text.

## Known product data and flows to confirm

| Data/flow             | Current product behavior to validate                                                                                       | Counsel/owner input                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Account identity      | Account name, email, password hash, verification/reset tokens, sessions                                                    | Controller/operator identity, lawful basis, user rights, contact and response process                        |
| Business records      | Business settings, customers, GST fields, invoices, tax snapshots, payments and expenses                                   | Purposes, sensitivity, retention/deletion, legal holds, customer notice obligations                          |
| Files                 | Receipt uploads use local private storage by default; Cloudinary is optional and not required for local use                | Production provider, location, subprocessors, retention, deletion and breach terms                           |
| Authentication safety | Password breach check sends a five-character SHA-1 hash prefix to the HIBP range API; full password/hash is not sent       | External service disclosure, transfer assessment, opt-out/product behavior if needed                         |
| Billing               | Razorpay SDK integration is present; provider checkout is not available until owner configuration; provider fees may apply | Provider role, data shared, fees/terms, retention and customer disclosures                                   |
| Email                 | Authentication email can use SMTP or Resend's hosted API; sample credentials are blank; customer reminder/email feature is not enabled | Owner-selected mail provider, recipient address and one-time authentication link shared with provider, retention and privacy terms, delivery/uncertain-delivery wording, unsubscribe/consent requirements |
| Diagnostics           | Structured server logs redact configured sensitive fields; no hosted error tracker is configured                           | Log contents, access, retention, incident response, any future tracking consent                              |
| Hosting and backups   | Production host, database region, backup schedule, and restore process are not configured here                             | Hosting/subprocessors, residency, retention, deletion, recovery and cross-border transfers                   |

## Required owner/counsel decisions

- Legal entity and contact details; applicable jurisdictions and audience.
- Final privacy notice, terms, cookie/analytics statement, retention schedule, data-subject request workflow, and incident/breach process.
- Controller/processor roles and contracts for hosting, database, file, email, payment, and safety-check services actually enabled.
- Tax/accounting wording review and qualified accountant sign-off remain separately required.

Record counsel, date, approved version, and unresolved issues outside this draft before public deployment.
