# InvoiceFlow backend

This backend uses Node.js >= 22.22.2, JavaScript ES modules, Express 5, Mongoose 9, Zod 4, and the exact pins in `package.json` / `package-lock.json`.

Create `.env` from `.env.example`, configure a MongoDB replica set, then use `npm ci`, `npm test`, and `npm start`. Startup validates environment values before opening the database connection. The `/health` endpoint returns a JSON health response.

Credentialed CORS allows the exact `FRONTEND_ORIGIN`. In development and tests, the matching `localhost` and `127.0.0.1` loopback origins are both accepted so the browser's Vite URL works with the default API settings. Production only accepts the configured origin. Restart the backend after changing `FRONTEND_ORIGIN`.

## Authentication and onboarding (Phase 2)

Auth endpoints are under `/api/auth`: `POST /register`, `POST /verify-email`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`, `POST /forgot-password`, `POST /reset-password`, `POST /change-password`, `GET|PUT /me`, `PUT /me/email`, `GET /sessions`, and `DELETE /sessions/:sessionId`. Login returns a short-lived bearer access token and sets an HttpOnly refresh-token cookie. Send the access token as `Authorization: Bearer <token>` and include credentials on refresh requests.

Business onboarding uses authenticated `POST /api/businesses`; read the current workspace at `GET /api/businesses/current`; change currency at `PATCH /api/businesses/current/currency`. A new local-development account receives its one-time verification or reset token in the API response when the selected email provider is not configured. This is for local development only; production startup requires SMTP or Resend credentials and a real sender address and never returns auth tokens in API responses. Do not expose a development server publicly.

New passwords are checked against the free Have I Been Pwned range API using its k-anonymity protocol: only the first five characters of a SHA-1 password hash are sent. The full password and full hash are not sent. If that endpoint cannot be reached, password creation fails closed with `BREACH_CHECK_UNAVAILABLE`.

Onboarding seeds a 14-day King trial record and local reference tax-rate versions. It does not start a paid service or contact Razorpay, Cloudinary, Sentry, or GlitchTip.

## Customers (Phase 4)

All customer endpoints require a bearer access token and an active business membership. The business scope comes from the signed-in membership; sending `businessId` in a request body is rejected.

- `GET /api/customers?search=<text>&page=1&limit=20` lists active customers, with tenant-scoped text search and pagination.
- `POST /api/customers` creates a customer.
- `GET /api/customers/:customerId` reads one customer.
- `PATCH /api/customers/:customerId` updates provided fields; send `shippingAddress: null` to clear the optional shipping address.
- `DELETE /api/customers/:customerId` archives the customer. Archived customers are excluded from normal reads and lists.
- `POST /api/customers/check-duplicates` returns non-blocking possible matches by normalized email, phone, GSTIN, or case-insensitive exact name.
- Owners can call `POST /api/customers/sample-data` once, before adding any customers, invoices, or expenses. It adds two clearly labeled sample contacts with `.invalid` email addresses, never sample financial records.

Owners and admins can create, update, and archive customers. Accountants can read them. GSTIN is format-checked and its first two digits must match a configured state code and the customer's billing state. The reference code list is in `src/config/gst-state-codes.json`; GSTIN validation is format-only and does not verify registration with a government service.

## Invoices and PDFs (Phase 5)

All invoice endpoints require an authenticated, active business membership and scope queries to that business. Draft lifecycle routes are `GET|POST /api/invoices`, `GET|PATCH|DELETE /api/invoices/:invoiceId`, `POST /api/invoices/:invoiceId/clear-amounts`, and `POST /api/invoices/:invoiceId/archive`. `POST /api/invoices/:invoiceId/finalize` assigns the next business-local financial-year number, snapshots business/customer details, increments usage in the transaction, renders the PDF, and archives it. PDF download is `GET /api/invoices/:invoiceId/pdf`.

The delivery ledger is append-only. `POST /api/invoices/:invoiceId/mark-sent` records the user's declaration that they handed over or sent the invoice outside InvoiceFlow. It does not deliver email or claim customer receipt. `POST /api/invoices/:invoiceId/unmark-sent` applies the delivery fence and records reversals. Tax-rate versions are appended at `POST /api/settings/tax-rates`; HSN policy is read/updated at `GET|PATCH /api/settings/hsn-policy`.

Invoice PDF storage uses local private disk by default (`INVOICE_STORAGE_PROVIDER=local`, under `backend/uploads/invoices`). An optional authenticated Cloudinary adapter is available when `INVOICE_STORAGE_PROVIDER=cloudinary` and all three Cloudinary credentials are configured. No cloud storage call is made by default. Keep local storage selected to avoid an external storage account or usage charges. The provider stores archived PDFs privately and verifies the SHA-256 hash on download.

Finalization records configured calculations and a PDF; it is not a certification of tax treatment. InvoiceFlow organizes invoice and tax information you configure. It does not file GST returns, give tax advice, or guarantee compliance. Review with a qualified accountant.

InvoiceFlow organizes invoice and tax information you configure. It does not file GST returns, give tax advice, or guarantee compliance. Review with a qualified accountant.

## Expenses (Phase 7)

The expense category routes are `GET|POST /api/expense-categories` and `PATCH|DELETE /api/expense-categories/:categoryId`. Onboarding creates the initial `General`, `Office supplies`, `Travel`, and `Utilities` categories. Categories can also be added, renamed, and archived.

Expense routes are `GET|POST /api/expenses`, `GET|PATCH|DELETE /api/expenses/:expenseId`. Lists support `page`, `limit`, `categoryId`, `from`, `to`, and `search`. `DELETE` archives a record. Amounts are integer minor units and each expense uses the business currency; recording the first expense sets the business financial-record currency lock in the same transaction.

Receipts use `POST|GET|DELETE /api/expenses/:expenseId/receipt`. They are private and tenant-scoped, checked against their file signature and SHA-256 hash, and limited to JPEG/PNG/WebP images up to 5 MB or PDFs up to 10 MB. Local private disk under `backend/uploads/receipts` is the default and needs no paid service. Authenticated Cloudinary storage is optional and used only when `INVOICE_STORAGE_PROVIDER=cloudinary` and its credentials are configured. Keep `INVOICE_STORAGE_PROVIDER=local` to avoid any external storage account or usage charges.

## Reminders and notifications (Phase 8)

Finalizing an invoice with a due date materializes persistent reminder rows. The default in-app schedule is three days before the due date, on the due date, and three days after, at 09:00 in the business timezone. The 48-hour lateness window skips old reminders. Changing an issued invoice's due date or the business schedule reconciles pending rows; payment to a zero balance or invoice archive cancels the remaining rows. Completed, skipped, and cancelled rows are terminal.

The in-process scheduler runs at startup and once a minute. `/api/reminders/run-now` uses the same fenced database lease as the timer. `/api/reminders/status` reports the last successful sweep and due, failed, held, uncertain, and cancelled counts. `GET /api/reminders` returns the paginated schedule history. Schedule settings are read at `GET /api/settings/reminders` and changed with `PATCH /api/settings/reminders`; Owner/Admin only. Disabling requires a second request with the exact `confirmCancelPending` count returned by the first request. Re-enabling records a new `enabledSince` time and never restores cancelled rows.

In-app notifications are available at `GET /api/notifications`; the signed-in user can mark one read with `PATCH /api/notifications/:notificationId/read` or mark all read with `POST /api/notifications/read-all`. Notifications are deduplicated per user and reminder. Customer email reminders are not enabled in this phase, and the scheduler does not contact SMTP or a paid service.

## Payments (Phase 6)

Payments are manual ledger entries; InvoiceFlow does not collect funds. Record a payment with `POST /api/invoices/:invoiceId/payments`, list history with `GET /api/invoices/:invoiceId/payments`, and reverse an entry with `POST /api/invoices/:invoiceId/payments/:paymentId/reverse`. Recording and reversal are transactional and audited. Payment idempotency keys prevent duplicate records; reversals require a separate idempotency key and a reason.

Each payment uses the invoice currency, cannot exceed the remaining balance, and updates `amountPaidMinor`, `balanceMinor`, and status in the same transaction as the immutable payment record. Reversals preserve the original payment facts and append reversal metadata. Recording a payment also asserts `Business.hasFinalizedRecords` and the currency lock. Owners, admins, and accountants may record or reverse payments; invoice readers may view payment history. Payment routes are tenant-scoped and return 404 for foreign invoices.

## Dashboard and reports (Phase 9)

`GET /api/reports/dashboard` returns business-local current-month finalized invoice count, open balance and invoice count, overdue balance and invoice count, active customer count, and the five latest issued invoices. Amounts are returned as integer minor-unit strings. Overdue status is derived at request time from the business date and due date.

CSV downloads are available at `GET /api/reports/sales.csv`, `/payments.csv`, `/outstanding.csv`, `/overdue.csv`, and `/customer-balances.csv`. The first four accept optional `from` and `to` calendar dates (`YYYY-MM-DD`) with ranges up to 367 days; customer balances show current open balances grouped by customer and currency. Exports are limited to 50,000 rows, tenant-scoped, private/no-store, and guard spreadsheet formula injection. Sales exclude drafts and cancelled invoices; payment exports exclude reversed records; outstanding and overdue reports include only positive balances.

## Selected Tier 2 features (Phase 10)

`GET /api/reports/cashflow` returns six business-local months of recorded payment inflows and non-archived expense outflows. It is King-plan gated by the `cashflow` entitlement; invoice totals are not treated as received cash. `GET /api/reports/customers.csv` exports active customers and their billing/shipping details, notes, and reminder preference; it requires `fullExport`. Both outputs are private/no-store and scoped to the current business. CSV exports cap at 50,000 rows and guard spreadsheet formula injection.

Each existing report is also downloadable as `GET /api/reports/:type.pdf` (`sales`, `payments`, `outstanding`, `overdue`, `customer-balances`). PDFs reuse the tenant-scoped report data and date validation, are capped at 50,000 rows, stream with private/no-store headers, and use PDFKit's built-in fonts. They add no package dependency.

Possible duplicate customer records are shown as warnings before creation; users may still add a legitimate similar customer. Sample data is owner-only, transactional, and available once in an empty workspace. It adds two clearly marked contacts only; it does not add invoices, payments, or expenses.

Recurring expense routes are `GET|POST /api/recurring-expenses`, `PUT|PATCH|DELETE /api/recurring-expenses/:ruleId`. Rules support weekly/monthly schedules, optional end dates, edits, pause/resume, and archive. The scheduler checks every 15 minutes and on startup. Each generated expense and schedule advance commit in one transaction; a unique `(rule, occurrence date)` index prevents duplicate occurrences. It leaves due rules pending while the workspace is read-only or lacks the expenses entitlement, and pauses rules whose category or business currency is no longer usable. Generated expenses use the existing business currency lock and activity log.

Before deploying Phase 10 to an existing database, apply the new indexes with `node --env-file=.env node_modules/migrate-mongo/bin/migrate-mongo.js up -f migrate-mongo-config.cjs` from `backend/`. To reverse the last migration, run the same command with `down` instead of `up`; review production migration timing under the normal database change procedure.

## Billing and entitlements (Phase 9A)

`GET /api/billing` returns the current plan, subscription state, usage, limits, feature entitlements, and configured plan prices. Owners can start checkout with `POST /api/billing/checkout`, verify its signature with `/checkout/verify`, request a plan change with `/change-plan`, cancel with `/cancel`, and view provider invoice history at `/invoices`. Razorpay webhooks are accepted at `POST /api/billing/webhooks/razorpay`; the raw request body is HMAC-verified, event IDs are deduplicated, and older events cannot overwrite newer subscription state.

Each new workspace starts a no-card 14-day King trial. Past-due accounts retain access during the seven-day grace period. A cancelled subscription remains writable through the paid period. Expired or halted accounts become read-only: they can view/download existing records and PDFs, record payments on issued invoices, and export business data at `GET /api/export`; they cannot create or change business records. Downgrades retain existing data, while server-side feature and capacity checks govern new activity. Owners can review plan pricing and usage under Billing in the app.

Razorpay is optional and no provider request is made unless credentials and a plan ID from `src/config/plans.json` are configured. Plan IDs are intentionally blank in a fresh checkout. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and the plan IDs from your Razorpay account before using checkout. Provider fees may apply; no claim is made that Razorpay is free. Tests use a local replica set and a fake provider; no account credentials are included in the repository. Customer payments remain manual ledger entries; InvoiceFlow does not collect funds. See `docs/PHASE_9A_SUMMARY.md`.
