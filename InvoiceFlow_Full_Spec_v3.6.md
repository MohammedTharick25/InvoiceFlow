# InvoiceFlow: Complete Architecture and Development Spec (v3.6, consolidated)

## 0. Instructions for the coding agent (read first)

You are building InvoiceFlow from this document. It is self-contained and is the single source of truth.

1. **Work phase by phase** (section 21). At the end of each phase: tests green, docs updated, short summary, then **stop and wait for the owner's go-ahead**. Do not start the next phase on your own.
2. **Phase 1 starts with Step 0** (section 18.1): re-check every pinned package with `npm view`. Stop and report if any package or version is missing. Never guess a version.
3. **Never** use `^`, `~`, `*`, `latest`, or `npm install` in CI. Exact pins, committed lockfiles, `npm ci` only.
4. **Never** write text that says the app or an invoice is "GST compliant" (5.12). Use the disclaimer in 5.9.
5. **Never** invent tax law. Rates, HSN policy and state data are configuration. The calculation policy `gst-calc-v1` is PROVISIONAL until accountant sign-off (5.10).
6. JavaScript only (no TypeScript), ES modules, Node >= 22.22.2.
7. Layer rules: controllers hold no business logic; repositories hold no rules or HTTP; services never see `req`; modules call other modules' services, not repositories.
8. If a rule here conflicts with something you would prefer, **follow this document and ask**.

---

## 1. Core decisions

| Area | Decision |
|---|---|
| Runtime | Node 22 LTS, **>= 22.22.2**, ES modules, JavaScript only |
| Backend | Express 5, Mongoose, MongoDB (replica set required for transactions) |
| Testing | Vitest, Supertest, mongodb-memory-server (replica set), Playwright (`@playwright/test`), React Testing Library, MSW, `@axe-core/playwright` |
| UI | React, Vite, Tailwind v4, scoped Radix primitives wrapped once in `components/ui` |
| Money | Integer minor units, basis points, BigInt intermediates, hard limits (3) |
| Currency | INR default; one per business; editable only before finalized records exist and while no draft holds an amount; never reinterpreted (4) |
| GST | Data-driven, effective-dated append-only rates, user-confirmed place of supply, five taxability categories, configurable HSN policy; calc policy PROVISIONAL; no compliance claims (5) |
| Invoice numbers | `{prefix}{FY}-{sequence}`, max 16 chars, allocated at Finalize, financial-year series, FY label `YY(start)+YY(start+1)`, start years 2000 to 2099, bounded sequence with explicit exhaustion error (6.2) |
| Invoice PDF | Rendered from a stored view-model, checked against a particulars checklist, **archived at Finalize** with sha256 (6) |
| Delivery | Finalize delivers nothing. PDF download, sharing helpers, Mark as sent are essential; email optional. "Sent" = user declaration or server acceptance, never proof of receipt. Email transmission and unmark are mutually exclusive via an atomic fence (7) |
| Tenancy | `BusinessMembership` + unique `(userId, slot)` partial index enforcing one business per user (9) |
| Scheduling | DB is the schedule; atomic leases with fencing; at-least-once in-app; duplicate-resistant customer email with an uncertain state; email held until invoice marked sent (10) |
| Overdue | Derived at read time |
| Plans and billing | Three paid plans (Basic, Anointed, King), 14-day trial on King, Razorpay Subscriptions, read-only after an unpaid trial (11) |
| Files | Cloudinary (private, authenticated) via a storage provider interface; local disk in dev/tests (12) |
| Dependencies | Exact pins, lockfiles, `npm ci` reproduction as a Phase 1 gate (18) |
| Release gate | No production release without recorded accountant sign-off (5.10) |

### 1.1 Missing-requirement guarantees (all must exist)
1. Dashboard module (read-only aggregation).
2. Atomic per-business invoice numbering inside the Finalize transaction; no duplicates, no gaps from failed finalizations.
3. Invoice snapshots of customer, business, tax rates and calc version at Finalize.
4. Immutability by status: Draft editable; Issued and Sent only notes and due date; Paid and Cancelled locked; corrections via cancel and re-issue.
5. Idempotency keys on payment, Finalize, Mark as sent, Unmark sent, invoice email.
6. Append-only audit log. Soft delete via `archivedAt`; hard delete only for Drafts with no payments.
7. Pagination, sort, filter contract with `meta`.
8. Timezone contract: UTC instants; invoice, due and tax-point dates stored as the business-local calendar date at UTC midnight.
9. Stable machine-readable error codes (15.3). Zod-validated env at boot. Injectable clock (`utils/clock.js`) for every date rule.
10. CSV-injection guard on exports. GST disclaimer wherever GST data is configured or exported.
11. Configurable HSN/SAC policy. GST invoice particulars checklist with a tested PDF view-model. Compliance review pack and signed accountant gate.
12. Delivery fence; lifecycle for business-level reminder disabling; durable invoice-level email exposure markers.

### 1.2 Risks and mitigations
| Risk | Mitigation |
|---|---|
| Transactions need a replica set | Atlas free tier is one; local `mongod --replSet`; tests use `MongoMemoryReplSet`; repositories accept an optional session |
| Cross-tenant leaks | Repositories require `businessId`; route-registry-driven isolation suite |
| Mass assignment | Zod `.strict()`; services copy explicit fields; totals always recomputed |
| Wrong or changed tax rate | Append-only effective-dated versions serialized per code; finalized invoices keep snapshot |
| Overflow / precision loss | Limits, `Number.isSafeInteger`, BigInt intermediates |
| Race on onboarding | Unique index guard inside a transaction |
| Duplicate customer emails | Idempotent in-app; duplicate-resistant email; uncertain-state policy |
| Unmark racing in-flight email | Atomic fence on Invoice; unmark refuses while started/accepted/uncertain |
| Reminders re-enabled resuming old rows | Disable cancels permanently; re-enable never reopens |
| Currency reinterpretation | Change refused while any draft holds an amount |
| GST treatment wrong in a real case | Provisional marking, review pack, mandatory sign-off, `calcVersion` |
| Rupee sign missing in PDF | Bundle OFL font; smoke test with rupee amount |
| Printed numbers repeating across centuries | Supported FY start years 2000 to 2099 only |
| Render free instances sleep | Scheduler persisted in DB; production uses always-on hosting (19.4) |
| Billing state wrong | Webhook-verified, idempotent, entitlements computed server-side (11) |

---

## 2. Technology notes
- Frontend is **not** created with `npm create vite@latest`. Hand-write `index.html`, `vite.config.js`, eslint config and entry files against the pinned table.
- PDFs are generated by the backend (PDFKit). jsPDF is not used.
- Use `@playwright/test`, not `playwright`.
- Use Node's built-in `--env-file` (no dotenv).

---

## 3. Money representation and limits

| Constant | Value | Meaning |
|---|---|---|
| `MAX_MONEY_MINOR` | 10^13 | Ceiling for any single amount and any invoice, payment or expense total (Rs 10,000 crore for INR) |
| `MAX_QUANTITY_MILLI` | 10^9 | 1,000,000.000 units; at most 3 decimals |
| `MAX_LINE_ITEMS` | 200 | Per invoice |
| `MAX_CHARGES` | 10 | Per invoice |
| Rates, % discounts | integer basis points 0 to 10000 | 18% = 1800 |

- Currency table gives decimals (INR/USD/EUR 2, JPY 0, KWD 3).
- 200 lines at the ceiling (2 x 10^15) stay below `Number.MAX_SAFE_INTEGER`, so totals can always be checked before precision is lost.
- Stored values: `Number` with validator `Number.isSafeInteger(v) && v >= 0 && v <= MAX_MONEY_MINOR`. Requests: `z.number().int().safe().max(MAX_MONEY_MINOR)`.
- Money is never parsed from floats. `parseMajorToMinor('1234.56','INR')` and `parseQuantityMilli('1.5')` parse strings and reject extra decimals, exponents, NaN, negatives, thousands separators. The UI uses the same functions.

### 3.1 Safe arithmetic
- All multiplication/division in BigInt with `roundHalfUp(num, den)`. **Round half up is the only rounding function in the codebase.**
- `toSafeNumber(big)` throws `AMOUNT_OUT_OF_RANGE` if negative, above `MAX_MONEY_MINOR`, or not safe.
- Browser preview uses the same BigInt code; the server is authoritative.
- Reports: per-group sums in BigInt; an over-range total returns `totalMinorString`; `formatMoney` accepts number, string or bigint.

---

## 4. Currency selection and locking

- Default INR; chosen at onboarding; no conversion in the MVP.
- **Locked** once any of these exist: a non-draft invoice, any payment (even reversed), any recorded expense.
- Mechanism: `Business.hasFinalizedRecords` set true in the same transaction that creates the first finalized record. The currency-change service runs in a transaction ending with `updateOne({_id, hasFinalizedRecords:false},{currency, currencyVersion:+1})`. `currencyLockedAt` records when.
- Existing drafts are **never relabelled or reinterpreted**, for any currency pair.
- A draft holds an amount if any item has `unitPriceMinor>0` or a fixed discount, or any charge has `amountMinor>0`. Archived drafts count.
- While any such draft exists: `PATCH /businesses/current/currency` returns 422 `DRAFTS_REQUIRE_REVIEW` with count and draft IDs; nothing changes.
- User resolves each draft by (1) deleting it (no payments) or (2) **Clear amounts** with a confirmation dialog (clears unit prices, fixed discounts, charge amounts; keeps customer, descriptions, quantities, % discounts, HSN/SAC, taxability, unit). Audit-logged with before-state. Bulk versions exist with one confirmation listing drafts and one audit entry per draft.
- Amount-free drafts get the new currency code in the same transaction (audited).
- Draft writes run in a transaction checking `draft.currency == business.currency` plus a conditional no-op update on Business guarded by `currencyVersion`. A stale draft save returns `CURRENCY_MISMATCH`.
- Owner-only, audit-logged. No self-service unlock in the MVP.

---

## 5. GST rules

### 5.1 Principles
- Rules live in data and settings. Code does arithmetic and consistency checks. Seeded defaults are editable, labelled "confirm with your accountant", non-authoritative.
- The app does not file GST, does not guarantee compliance, does not give tax advice.
- No screen, PDF, README or marketing text may claim "GST compliant" (5.12).
- When unsure, ask the user and record the answer; never silently guess.
- Out of MVP scope: reverse charge (blocks Finalize, 5.11), e-invoicing, e-way bill, composition scheme, cess, TDS/TCS, export/SEZ with tax payment, input tax credit, digital signatures.

### 5.2 Taxability categories (per line and per charge)
| Category | Tax | Notes |
|---|---|---|
| `taxable` | at configured rate > 0 | requires `taxCode` |
| `zero_rated` | none | separate bucket |
| `exempt` | none | optional `taxabilityNote` |
| `nil_rated` | none (0%) | separate bucket |
| `non_gst` | none | outside GST scope; separate bucket |

Definitions shown to users are plain-language and marked "as commonly understood; confirm with your accountant". Each non-taxable category keeps its own bucket in totals.

### 5.3 Place of supply
- Invoice carries `placeOfSupply {stateCode, basis, overridden, note}` and optional `shipTo {address, stateCode}`.
- App only offers candidates labelled by source (customer billing state, customer registered/GSTIN state, ship-to state, business state). If they differ the UI shows them and asks. `basis` in `customer_billing | customer_registered | ship_to | business_location | manual`.
- GST-registered business: Finalize requires explicit confirmation (`PLACE_OF_SUPPLY_REQUIRED`). Drafts may omit it.
- `supplyType` derived mechanically: not registered → `none`; same state → `intra` (CGST+SGST, or CGST+UTGST where reference data marks the territory; store `stateTaxLabel`); different state → `inter` (IGST); `other` (user flags export/SEZ/deemed export): every line must be `zero_rated|exempt|nil_rated|non_gst`, otherwise `TAXABLE_LINE_NOT_SUPPORTED_FOR_SUPPLY_TYPE`; a note is required.
- State codes in `config/gst-state-codes.json` (versioned, includes union territories and "other territory", field `intraSecondTax` SGST|UTGST). GSTIN check: 15 chars, standard pattern, first two digits equal the party's state code; format only.
- The suggestion helper is a pure function with no legal rule table.

### 5.4 Effective-dated tax rates (append-only)
- `TaxRate` is one immutable document per version: `businessId, code, name, kind (rate|end), rateBp (null for end), effectiveFrom (business-local date, or null = since beginning, first version only), previousVersionId, contentHash (sha256 of code, kind, rateBp, effectiveFrom), createdBy, createdAt`. No `effectiveTo`, `supersedesId` or `updatedAt`. A version's end is derived from the next version.
- Resolution: version in force on date D = greatest `effectiveFrom <= D` for the code (null earliest). If it is an end version or none exists → `TAX_RATE_NOT_CONFIGURED`.
- Changing a rate inserts a later version; discontinuing inserts an `end` version. Ordering rule: new `effectiveFrom` must be strictly later than the latest stored for that code, else `TAX_RATE_VERSION_OUT_OF_ORDER` (409). Mistakes are corrected by a later corrective version.
- Enforcement: (1) schema fields `immutable:true`, update/delete hooks throw; (2) `tax-rate.repository` exposes insert and read only (a static test fails if update/delete appears); (3) DB unique `(businessId, code, effectiveFrom)` plus insert/find-only role where hosting allows.
- Tax-point date (default issue date, editable) selects the version. Drafts re-resolve on every save.
- At Finalize the invoice stores per line/charge: `taxability, taxCode, taxRateVersionId, rateBp, taxableMinor, cgstMinor, sgstMinor, igstMinor`, plus `calcVersion`, `stateTaxLabel`. After that nothing depends on TaxRate documents. If the rate in force differs from what the user last saw, Finalize stops with `TAX_RATE_CHANGED_REVIEW_REQUIRED`.
- Seeded per business: codes for 5%, 18%, 40% (first version `effectiveFrom:null`) with heads. Zero-tax cases use taxability categories, not 0% rates.

**Per-code serialization with `TaxRateHead`** (one doc per `(businessId, code)`: `latestEffectiveFrom, latestVersionId, versionCount, seq, updatedAt`; unique `(businessId, code)`; operational pointer, rebuildable, holds no rate):
1. In one transaction (short retry loop for transient errors), conditionally advance the head: filter `{businessId, code, latestEffectiveFrom null or < new}`; set latest fields, `$inc` versionCount and seq; return the before-document.
2. If matched, insert the TaxRate with `previousVersionId` from the before-document.
3. If not matched, read the head: none → insert head (unique index decides races; on duplicate key abort and restart at step 1); exists → abort `TAX_RATE_VERSION_OUT_OF_ORDER`.
4. Commit.
Every insert writes the same head, so concurrent inserts conflict at the DB. Only the insert service writes heads. An integrity check (tests and cleanup job) verifies head equals greatest version and the `previousVersionId` chain is strictly increasing; drift is logged and notifies the owner.

### 5.5 Shipping and other charges
`charges[]` with `type (shipping|packing|insurance|other), description, amountMinor, taxability, taxCode, optional hsnSac`. Same engine as items. The user chooses treatment per charge; UI pre-selects the items' rate only if all items share one. Invoice-level discount is allocated across **item lines only** (largest-remainder); charges are not discounted.

### 5.6 Calculation per line (BigInt, then range-checked)
```
gross    = roundHalfUp(quantityMilli * unitPriceMinor, 1000)
discount = percent ? roundHalfUp(gross * discountBp, 10000) : fixedMinor   (<= gross)
taxable  = gross - discount - allocatedInvoiceDiscount                      (>= 0)
taxable category, intra: cgst = roundHalfUp(taxable * rateBp, 20000); sgst = cgst; tax = cgst + sgst
taxable category, inter: igst = roundHalfUp(taxable * rateBp, 10000); tax = igst
other categories: tax = 0
lineTotal = taxable + tax
```
Totals are plain sums of line values (no re-rounding). Totals include `byTaxability` and `taxSummary[]` (per taxCode and rate: taxable, cgst, sgst, igst).

### 5.7 CGST/SGST rounding: PROVISIONAL (`gst-calc-v1`)
CGST and SGST are each computed on taxable at half rate, rounded half up, per line, never at invoice level. Example: taxable 10010 at 5%: independent = 250 + 250 = 500; single rounding would give 501. Stored as `calcVersion:'gst-calc-v1'`. A different treatment ships as `gst-calc-v2` without touching finalized invoices. Settings and docs show "calculation policy provisional". Passing tests prove the arithmetic matches the stated policy, not that the policy is correct.

### 5.8 HSN/SAC: configurable policy
- Format validation always: digits only, length 4, 6 or 8; no directory validation.
- Business setting `tax.hsnPolicy {declaredTurnoverBand, source, confirmedBy, confirmedAt}`. The app does not compute turnover.
- `config/gst-hsn-rules.json` (non-authoritative): table of `turnoverBand x context (b2b|b2c)` → `{requirement: required|recommended|not_required, minDigits: 4|6|8}`. Seeded default: `recommended`, 4, every cell, with banner "HSN/SAC rules depend on your turnover and customer type. Confirm the right setting with your accountant."
- Context per invoice: b2b if recipient has GSTIN else b2c; override recorded (`recipientContext`, `overridden`).
- Finalize: `required` → `HSN_SAC_REQUIRED` / `HSN_SAC_TOO_SHORT`; `recommended` → warning only; `not_required` → no check. Invoice stores `hsnRequirement`, `hsnMinDigits`, `recipientContext`.

### 5.9 Disclaimer (verbatim, shown in tax settings, GST exports, review screens, README, landing footer)
> InvoiceFlow organizes invoice and tax information you configure. It does not file GST returns, give tax advice, or guarantee compliance. Review with a qualified accountant.

### 5.10 Release gate: mandatory accountant validation
Production release (Phase 12) is blocked until a qualified accountant reviews and the review is recorded. Scope: calculation (rounding, discount allocation, charges, totals); invoice treatment (taxability, place of supply, supply types, SGST/UTGST labels, tax-point date); HSN/SAC policy table and defaults; PDF checklist, titles, declarations; numbering (series, annual reset, FY label incl. January-start quirk, width, exhaustion, continuation series); limits of scope and reverse-charge handling; user-facing copy.
- Evidence pack generated in Phase 11 to `docs/compliance/REVIEW_PACK.md`: written calculation spec, worked examples from test fixtures (intra, inter, exempt-only, nil-rated, mixed rates, charges, invoice discount, rounding edges, other supply type), sample PDFs, checklist status, HSN table, numbering examples.
- Output: `docs/compliance/ACCOUNTANT_SIGNOFF.md` (reviewer name and qualification, date, scope, findings, resolutions, `calcVersion`, PDF template version and hash).
- `scripts/check-release-gate.mjs` fails unless the sign-off exists and its `calcVersion` and template hash match the code. Any later calc or template change needs fresh sign-off. Staging is unaffected. Wording is "reviewed by", never "certified compliant".

### 5.11 Reverse charge: unsupported, declared, blocking
- Each invoice from a GST-registered business has `reverseCharge {status, confirmedBy, confirmedAt, note}`; status `unset` (default) | `not_applicable` | `applies` | `unsure`.
- Finalize asks, with no pre-selected answer and no carried-over default: "Is the GST on this supply payable by your customer instead of you (reverse charge)?" Answers: "No, it is not" / "Yes, it is" / "I am not sure". Beneath: "Confirm with your accountant. InvoiceFlow does not support reverse charge in this release."
- `unset` → 422 `REVERSE_CHARGE_CONFIRMATION_REQUIRED`; `applies|unsure` → 422 `REVERSE_CHARGE_NOT_SUPPORTED` (stays draft; cannot be issued, numbered, marked sent or emailed); `not_applicable` → proceeds; confirmer and time stored and audit-logged.
- PDF prints "Tax payable on reverse charge: No" only for a user-confirmed `not_applicable`. Omitted for unregistered businesses and drafts. A duplicated invoice starts `unset`.

### 5.12 Forbidden-compliance-claims check (`scripts/check-forbidden-claims.mjs`, rules in `scripts/claims-rules.json`)
- **user-facing mode** (frontend strings/JSX, email templates, PDF template and view-model text, HTML title/meta, built bundle, README, landing site, pricing and billing copy): a match fails unless it is a negative statement or an allowlisted sentence.
- **policy mode** (`docs/**`, `*.test.js`, `tests/fixtures/**`, `claims-rules.json`): not scanned.
- Patterns include: "GST compliant" (and hyphenated), "fully compliant", "guarantees compliance", "ensures compliance", "certified", "approved by the GST authorities", "accountant-approved", "legally valid", "audit-proof".
- A match is negative only if a negation cue (not, no, never, cannot, does not, without, n't) is in the same sentence, before the phrase, within six tokens, with no contrastive word (but, however) between. "Not only/just/merely" are not negation cues.
- Allowlist `docs/compliance/claims-allowlist.json` stores sentence hashes. The script verifies the 5.9 disclaimer exists verbatim in tax settings, GST export header, README and landing footer. Output names file, line, rule id, sentence. It is a pattern check; the accountant read-through remains the backstop.

---

## 6. Invoice PDF, numbering and fonts

### 6.1 PDF specification
The PDF is drawn from a pure view-model `buildInvoicePdfModel(invoice)` built only from stored snapshot values. The checklist test inspects the view-model.

| # | Particular | Source |
|---|---|---|
| 1 | Title: Tax Invoice / Invoice / Bill of Supply | derived from registration and line taxability (`templateType`, data-driven) |
| 2 | Supplier name, address, GSTIN (omitted if unregistered) | `businessSnapshot` |
| 3 | Invoice number (unique, consecutive in series, <= 16 chars; letters, digits, hyphen, slash) | allocated at Finalize |
| 4 | Date of issue (business-local) | `issueDate` |
| 5 | Recipient name, address, GSTIN where registered | `customerSnapshot` |
| 6 | Delivery address and state when different from billing | `shipTo` |
| 7 | Place of supply with state name and code | `placeOfSupply` |
| 8 | Description of goods/services | `items[].description` |
| 9 | HSN/SAC | `items[].hsnSac` |
| 10 | Quantity and unit of measure | `quantityMilli`, `items[].unit` |
| 11 | Unit price, line value, discount | `items[]` |
| 12 | Taxable value per line and total | `taxableMinor`, totals |
| 13 | Rate and amount of CGST and SGST/UTGST or IGST | line and `taxSummary`; label from `stateTaxLabel`; cess unsupported, noted |
| 14 | Total in figures and words (Indian numbering) | `totals.totalMinor`, `amountInWords()` |
| 15 | Tax amount per rate | `taxSummary` |
| 16 | Reverse-charge line (only after explicit confirmation) | 5.11 |
| 17 | Signatory name and blank signature line | settings |
| 18 | Declarations and terms | `settings.invoice.declarations` (default blank) |
| 19 | Exempt/nil-rated/non-GST labels with `taxabilityNote` | items |
| 20 | Payment details (optional) | `settings.payment` |
| 21 | "DRAFT, not a tax invoice" marking, no number, when not finalized | `status` |

Fonts: bundle an OFL font containing the rupee sign in `backend/assets/fonts` (with licence), register in `pdf.service`. Smoke test uses rupee amount and amount in words.

### 6.2 Invoice numbering
- Format `{prefix}{FY}-{sequence}`, e.g. `INV2627-000042`. Prefix 1 to 5 chars (letters, digits, hyphen, slash). FY exactly 4 digits. Sequence zero-padded to width W. Total length <= 16 always.
- **FY encoding:** `invoice.financialYearStartMonth` (1 to 12, default 4). Start year Y = `year(issueDate)` if `month(issueDate) >= startMonth` else `year-1` (business-local). Label = `YY(Y)` + `YY(Y+1)`, `YY(n)` = n mod 100 zero-padded. FY 2026-27 → `2627`. Counter key `invoice:{Y}-{YY(Y+1)}`.
- Examples: 2026-04-01 → 2627; 2027-03-31 → 2627; 2027-04-01 → 2728; 2000-04-01 → 0001; 2099-04-01 → 9900; start month 1 with 2026-06-15 → 2627 (January-start uses Y and Y+1 uniformly; on accountant list).
- **Supported start years 2000 to 2099** (labels unique in range). Checked at draft save and at Finalize → 422 `FINANCIAL_YEAR_OUT_OF_RANGE` with `details.startYear`. `INVOICE_NUMBER_FORMAT_INVALID` covers only length/character violations.
- Invoice stores `financialYear {startYear, label}`. Numbers are never parsed back.
- **Start-month lock:** first allocation sets `BusinessSettings.invoice.startMonthLockedAt` inside the Finalize transaction with a conditional update; settings update requires it null. Refused change → 409 `FINANCIAL_YEAR_START_MONTH_LOCKED`.
- **Width:** `invoice.sequenceWidth` default 6, min 6; require `len(prefix)+4+1+W <= 16`. `maxSeq = 10^W - 1`.
- **Series fix:** prefix, width, maxSeq copied to the Counter on the first allocation of a financial year; settings changes apply from the next FY's first allocation (Settings says so).
- **Allocation in the Finalize transaction:** (1) `findOneAndUpdate({businessId,key,seq:{$lt:maxSeq}},{$inc:{seq:1}})` with upsert for the first number; (2) duplicate key on upsert → re-read, if `seq>=maxSeq` exhausted else retry; (3) counter at max → 422 `INVOICE_NUMBER_SERIES_EXHAUSTED`, invoice stays draft, counter unchanged, nothing wraps; (4) pre-commit assertion `length<=16 && seq<=maxSeq` else `INVOICE_NUMBER_FORMAT_INVALID`.
- Guarantees: no gaps from failure (rolled back with the transaction); no reuse (counter never decremented; cancelled invoices keep numbers); drafts have no number (partial unique index on `(businessId, number)` where number is a string). 90% of maxSeq → deduplicated notification and dashboard notice. No self-service remedy at exhaustion (documented support procedure for a continuation series in DEPLOYMENT.md; on accountant list).

### 6.3 PDF archival at Finalize
- Inside the Finalize flow, render the PDF from the stored snapshot, compute sha256, store via `storage.service` (private), set `Invoice.pdfFileId, pdfSha256, pdfTemplateVersion` (immutable after Finalize). PDF creation-date metadata is fixed from `issuedAt` so a re-render is reproducible.
- Because upload is external: render, upload to a staging key, run the DB transaction, then promote; a compensating cleanup job removes orphaned uploads. A render or upload failure aborts Finalize with no number, no counter increment, no usage increment.
- Download serves the stored file, verifies sha256, appends the `pdf_download` event. Drafts render on demand with the DRAFT label.
- A template change requires fresh accountant sign-off and applies to future invoices only.

---

## 7. Finalizing and delivering an invoice

### 7.1 Actions
| Action | Scope | Does | Status effect |
|---|---|---|---|
| **Finalize** | Essential | Runs all validations (place of supply, tax rates, HSN policy, reverse-charge, FY range, limits, plan limit), allocates number, stores snapshots and PDF, locks money/tax/party fields, schedules reminders. **Delivers nothing.** | draft → issued; records `issuedAt, issuedBy`, audit |
| **Download PDF** | Essential | Serves stored PDF (drafts render labelled) | none; `pdf_download` event for finalized |
| **Share manually** | Essential | Helpers only: browser share sheet with PDF where supported, copy-ready message text (number, amount, due date), mailto draft (cannot attach PDF; the screen says so) | none; nothing recorded |
| **Mark as sent** | Essential | User states they delivered it, choosing how (`handed_over, own_email, whatsapp, post, other`), when, optional note | issued → sent, `sentBasis user_declared`; `sentAt` (user's stated time), `sentVia`, `sentBy` |
| **Unmark sent** | Essential | Reverts a mistaken declaration under 7.5 | sent → issued; appends `unmark_sent` row |
| **Email invoice** | Optional (Tier 2) | Emails PDF over SMTP via the begin-send fence and the 10.5 outcome classification | issued → sent only on mail-server acceptance (`email_accepted`) |

### 7.2 Statuses
`draft` (editable, no number); `issued` (finalized and numbered, no claim of receipt); `sent` (declared or server-accepted, never proof of receipt; UI says "Marked as sent by you on..." / "Accepted by the mail server on..." and never "delivered"); `partially_paid`, `paid` (derived from payments; a payment on a never-sent invoice leaves `sentAt` empty); `cancelled` (from issued or sent, subject to payment rules); `overdue` (derived from due date for unpaid issued/sent/partially paid). No "viewed" status or `firstViewedAt` in release 1.0 (returns with the customer portal as timestamps).
- A failed or uncertain invoice email leaves status `issued`. Invoice-email uncertain outcomes are never automatically retried; manual resend is available.
- The first delivery sets `sentAt`; later deliveries are logged only.
- Dashboard shows a count of issued-not-sent invoices. Reminders are scheduled at Finalize; customer email reminders wait for Mark as sent (10.9).

### 7.3 Delivery log
`InvoiceDelivery` is append-only: PDF downloads, mark-as-sent, unmark-sent, email attempts. Email rows follow the state machine started → accepted | failed_retryable | failed_permanent | uncertain. Rows are never edited except an email row's status moving forward.

### 7.4 Terminology (guarded by `terminology.test.js`)
| Term | Means | Never used for |
|---|---|---|
| Finalize | Validate, number, snapshot, lock (draft→issued). Delivers nothing | sending, delivering |
| Issued | Finalized and numbered | received, delivered |
| Mark as sent | User declares delivery | finalizing |
| Email invoice | App emails PDF; sent only on server acceptance | finalizing |
| Sent | Declared or accepted | delivered |
UI button is "Finalize", route `/finalize`. No "Send invoice" label and no `/send` route.

### 7.5 Unmark sent and the delivery fence
- Origins stay distinct: `user_declared` vs `email_accepted`. Decisions look at delivery records, not `sentBasis` alone.
- **Fence:** `Invoice.deliveryFenceSeq` (int, starts 0). Every transaction that begins customer email transmission, and every unmark, conditionally updates the Invoice and increments it; other Invoice writers (mark sent, payment, cancellation, email acceptance) conflict naturally.
- **Begin-send transaction** (invoice email, reminder email, manual resend; nothing is transmitted before it commits): (1) reload invoice, customer, settings and evaluate eligibility (reminder: 10.9 steps 1 to 4; invoice email: status issued/sent/partially_paid, not archived, SMTP configured, customer email present); (2) conditional Invoice update with the ordering predicate (reminder: status sent/partially_paid, `sentAt` not null, not archived, balance > 0; invoice email: status issued/sent/partially_paid, not archived) and `deliveryFenceSeq == read value`, incrementing it; (3) if matched insert the delivery row `started` with deterministic `messageId` in the same transaction, commit, only then contact SMTP; (4) if not matched: no row, nothing transmitted; reminder channel becomes held/not_applicable/skipped per 10.9; invoice email returns 422.
- **Unmark transaction:** read invoice and deliveries; check permitted conditions; conditional update with filter `status:'sent'` and the fence value; set status issued, clear `sentAt, sentVia, sentBasis, sentBy`; increment fence; append `unmark_sent` row (with reversed IDs and required note), write audit, adjust reminder channels, commit.
- **Permitted only if:** (1) status is exactly `sent` (not partially paid/paid); (2) every delivery that produced sent is a `mark_sent` declaration and no email InvoiceDelivery row is `started|accepted|uncertain`; (3) `Invoice.customerEmailExposure.acceptedAt` and `.uncertainAt` are both unset and no retained ReminderDelivery email row is started/accepted/uncertain.
- Otherwise 422 `UNMARK_SENT_NOT_ALLOWED` with `details.reason` in `not_sent, has_payments, sent_by_email, customer_email_accepted, customer_email_uncertain, email_in_flight` (the last has `retryable:true`; UI: "An email is being sent. Try again in a minute."). `failed_*` rows do not block. "In flight" = an email row in `started`. A `processing` ReminderLog with no started delivery is not in flight.
- **Durable exposure markers:** ReminderDelivery rows expire (~400 days) so they cannot be the permanent safety record. When a reminder email attempt becomes `accepted`, the same transaction sets `Invoice.customerEmailExposure.acceptedAt` and `acceptedDeliveryId` only if null; `uncertain` (including lease-expiry recovery from started) sets `uncertainAt` and `uncertainDeliveryId` only if null. Failed outcomes set nothing. Markers are sticky: no API (unmark, retry, resend, archive, settings) clears or overwrites them. If both set, `accepted` takes precedence for the reason. Unmark returns the reason from the marker even after delivery rows are gone.
- **Effects of unmark:** appends one row; `mark_sent` rows are never edited; before-state in audit; history stays visible ("Marked as sent by you on...; reverted by you on..."); idempotent via key. Reminders: only email channels in `pending` whose ReminderLog row is still `pending` return to `held`; `processing` rows are handled by the fence; `done, failed, uncertain, skipped, not_applicable` channels and all delivery rows are untouched.
- Residual limit (documented): changes outside the Invoice document (customer email edit, SMTP settings, reminders disabled) in the milliseconds after begin-send cannot recall a message already being transmitted. A started email is never cancelled.

---

## 8. Database schema

All tenant-owned collections carry `businessId` first in compound indexes. All have `createdAt`/`updatedAt` except TaxRate and append-only logs.

### 8.1 Global collections
- **User**: email (unique lowercase), passwordHash, name, phone, emailVerifiedAt, status, lastLoginAt, theme, `trialUsedAt`, failed-login counters (lockout).
- **RefreshToken**: userId, tokenHash, familyId, expiresAt (TTL), revokedAt, replacedBy, userAgent, ip.
- **AuthToken**: userId, type (verify_email | reset_password), tokenHash, expiresAt (TTL), usedAt.
- **Business**: name, type, email, phone, address, timezone, currency (default INR), currencyVersion, hasFinalizedRecords, currencyLockedAt, `tax{gstRegistered, gstin, stateCode, hsnPolicy{declaredTurnoverBand, confirmedBy, confirmedAt}}`, logoFileId, plan, `billing{subscriptionId, entitlementPlanKey, entitlementState}` (derived cache), onboardingStep, onboardingCompletedAt, createdBy.
- **BusinessMembership**: userId, businessId, role (owner|admin|accountant|staff), permissions[], status (active|disabled), slot. Indexes: unique `(businessId,userId)`; unique `(userId,slot)` with partial `{status:'active'}`.
- **Invitation**: businessId, email, role, tokenHash (unique sparse), invitedBy, expiresAt (TTL), acceptedAt, revokedAt. Membership created only when an existing verified user accepts.
- **JobRun** (TTL 60 days): jobName, trigger (tick|startup|request|manual), ownerId, startedAt, finishedAt, status, stats{claimed, completed, skipped, held, cancelled, failed, uncertain, recovered, reconciled}, error.
- **JobLease** (`_id` = job name): ownerId, epoch (fencing token), leaseUntil, heartbeatAt, lastSuccessAt.

### 8.2 Tenant-owned collections
- **BusinessSettings** (1 per business): `invoice{prefix(1-5), sequenceWidth, financialYearStartMonth, startMonthLockedAt, defaultTermsDays, defaultNotes, footer, template, signatoryName, declarations}`, `payment{bankDetails, upiId, instructions}`, `reminders{enabled, enabledSince, disabledAt, sendTimeLocal, schedule[{key,offsetDays,when}], maxLatenessHours, emailEnabled, retry{maxAttempts, backoffMinutes[]}, autoRetryUncertain(default false), autoRetryUncertainAcknowledgedAt, autoRetryUncertainAcknowledgedBy, templates}`, notificationPrefs.
- **TaxRate**, **TaxRateHead**: see 5.4. **Counter**: businessId, key, seq, prefix, width, maxSeq, financialYear{startYear,label}; unique `(businessId,key)`.
- **Customer**: businessId, name, email, phone, billingAddress{..., stateCode}, shippingAddress (optional), gstin, notes, reminderPrefs{enabled}, archivedAt. Indexes `(businessId, archivedAt, name)`, text on name/email.
- **Invoice**: businessId, customerId, number (null while draft), status, issueDate, dueDate, taxPointDate, currency, templateType, financialYear, placeOfSupply, shipTo, supplyType, stateTaxLabel, recipientContext, hsnRequirement, hsnMinDigits, customerSnapshot, businessSnapshot, calcVersion, `items[{description, hsnSac, unit, quantityMilli, unitPriceMinor, discount{type,value}, taxability, taxCode, taxRateVersionId, rateBp, taxabilityNote, taxableMinor, cgstMinor, sgstMinor, igstMinor, taxMinor, totalMinor}]`, `charges[{type, description, amountMinor, hsnSac, taxability, taxCode, taxRateVersionId, rateBp, taxableMinor, cgstMinor, sgstMinor, igstMinor, taxMinor, totalMinor}]`, `totals{subtotalMinor, discountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, taxMinor, chargesMinor, totalMinor, byTaxability{...}, taxSummary[]}`, amountPaidMinor, balanceMinor, notes, terms, reverseCharge, issuedAt, issuedBy, sentAt, sentVia, sentBasis, sentBy, `deliveryFenceSeq`, `customerEmailExposure{acceptedAt, acceptedDeliveryId, uncertainAt, uncertainDeliveryId}`, `pdfFileId, pdfSha256, pdfTemplateVersion`, cancelledAt, archivedAt, duplicateOf, createdBy. Indexes: unique partial `(businessId, number)` where number is a string; `(businessId,status,dueDate)`; `(businessId,customerId,issueDate)`; `(businessId,issueDate)`.
- **InvoiceDelivery** (append-only): businessId, invoiceId, method (pdf_download|mark_sent|unmark_sent|email), via, status (recorded|started|accepted|failed_retryable|failed_permanent|uncertain), declaredAt, recordedAt, recordedBy, reverses[], note, recipient (masked), messageId, attempt, manual, error{code,message}, idempotencyKey, leaseToken. Indexes: `(businessId,invoiceId,recordedAt)`; unique partial `(businessId,idempotencyKey)` where string; unique partial `(businessId,invoiceId,method,attempt)` where `method:'email'`. Validator: integer `attempt>=1` for email, rejected on other methods. Only an email row's status moves forward. TTL ~400 days on `pdf_download` rows only (partial TTL index).
- **Payment**: businessId, invoiceId, customerId, amountMinor, currency, paidAt, method, reference, notes, status (recorded|reversed), reversedAt, reversedBy, reversalReason, idempotencyKey, recordedBy. Never edited or deleted. Unique partial `(businessId,idempotencyKey)`.
- **ExpenseCategory** (unique `(businessId,name)`), **Expense** (businessId, categoryId, vendor, description, amountMinor, currency, date, method, reference, receiptFileId, notes, archivedAt).
- **ReminderLog** (one row per invoice per rule): businessId, invoiceId, ruleKey, dueAt, runAt, status (pending|processing|completed|partial|failed|skipped|cancelled), skipReason, attempts, lease{token, ownerId, expiresAt}, `channels{inApp:{state}, email:{state, reasonCode, attempts, lastDeliveryId}}`, completedAt, jobRunId. Channel state: `not_applicable|pending|held|done|skipped|failed|uncertain`. reasonCodes: `smtp_not_configured, email_disabled, no_customer_email, customer_reminders_disabled`. Row skip/cancel reasons: `stale, invoice_not_marked_sent, invoice_paid, invoice_cancelled, invoice_archived, zero_balance, business_reminders_disabled, rule_removed`. Terminal: completed, failed, skipped, cancelled (never reopened). Unique `(businessId,invoiceId,ruleKey)`; indexes `(status,runAt)`, `(status,lease.expiresAt)`, `(businessId,invoiceId)`.
- **ReminderDelivery**: businessId, reminderLogId, invoiceId, channel (in_app|email), attempt, manual, status (started|accepted|failed_retryable|failed_permanent|uncertain), messageId, recipient (masked), providerResponse (redacted), error, startedAt, finishedAt, jobRunId, leaseToken. Unique `(reminderLogId,channel,attempt)`; index `(businessId,invoiceId,channel,status)`; TTL ~400 days (safe because permanent protection uses the invoice markers).
- **Notification** (unique partial `(businessId,userId,dedupeKey)`), **ActivityLog** (append-only: businessId, actorId, action, entityType, entityId, before, after, ip, at), **IdempotencyKey** (TTL 24 h), **StoredFile** (businessId, purpose logo|receipt|scan|invoice_pdf, provider, publicId, deliveryType, filename, mime, size, sha256, uploadedBy).
- **Billing:** **Subscription**, **BillingEvent**, **UsageCounter** (11.4).
- Phase 13 only: ScanDraft.

### 8.3 Relationships
User 1--* BusinessMembership *--1 Business (MVP: slot 1 only). Business 1--* Invitation, TaxRate (grouped by code) 1--1 TaxRateHead per code, Customer 1--* Invoice 1--* Payment, Invoice 1--* InvoiceDelivery, Invoice 1--* ReminderLog 1--* ReminderDelivery, Business 1--1 BusinessSettings, 1--1 Subscription, 1--* ExpenseCategory 1--* Expense, 1--* ActivityLog/Notification/StoredFile/Counter/UsageCounter.

---

## 9. Tenancy and the one-business rule
- Request pipeline: `authenticate` → `tenantContext` (active membership from JWT `membershipId`) → `authorize` → `entitlements` → controller → service → repository (`businessId` is the required first argument). Misses return 404, not 403. `businessId` in any request body is rejected.
- **One business per user** is a DB guarantee: unique `(userId, slot)` on active memberships. Onboarding runs in one transaction: Business, BusinessSettings (with `reminders.enabledSince`), default categories and tax rates with heads, Subscription (trialing), Membership `{slot:1}`. A racing duplicate gets E11000 → 409 `USER_ALREADY_HAS_BUSINESS` and the transaction rolls back (no orphans). Invitation acceptance by a user with an active membership is rejected. Slot = lowest free positive integer up to `MAX_BUSINESSES_PER_USER` (1 in MVP). Disabling a membership frees the slot. Future multi-business needs no schema change.

### 9.1 Permission matrix
| Capability | Owner | Admin | Accountant | Staff |
|---|---|---|---|---|
| Team and roles | yes | no | no | no |
| Business, tax, invoice settings | yes | yes | no | no |
| Currency change | yes | no | no | no |
| Billing and plan changes | yes | no | no | no |
| Reminder settings (incl. disabling) | yes | yes | no | no |
| Customers CRUD | yes | yes | read | configurable |
| Invoices CRUD, Finalize, Mark/Unmark sent | yes | yes | read | create draft (configurable) |
| Record/reverse payments | yes | yes | yes | no |
| Expenses CRUD | yes | yes | yes | configurable |
| Reports and exports | yes | yes | yes | no |
Build the permission system in Phase 2 even though only Owner is exercised initially.

---

## 10. Reminders and jobs

### 10.1 Outputs
(1) In-app notification to the business's users, always created while reminders are enabled. (2) Customer email: optional (needs SMTP, a customer email, customer reminders on, invoice marked sent, plan allows email).

### 10.2 Guarantees
Schedule processing: at least once, by exactly one lease holder at a time; fenced writes stop stale workers. In-app: effectively once (unique `dedupeKey`). Customer email: duplicate-resistant, **not** exactly-once; outcomes can be unknowable and the system never claims otherwise.

### 10.3 Persistent schedule
On Finalize, due-date change, schedule change, payment or cancellation, `reminder.service` materialises or cancels ReminderLog rows (`dueAt` in business timezone at `sendTimeLocal`), only while reminders are enabled. A reconcile sweep creates a row only when none exists for `(invoice, ruleKey)`, only for invoices with `issuedAt >= reminders.enabledSince`, and only for rules still inside the lateness window or in the future. **Terminal rows are never reopened.** Before each channel the invoice is reloaded; if paid/cancelled/archived/zero balance/reminders disabled → skipped or cancelled with reason, nothing delivered.

### 10.4 Claims and leases
Row claim: one atomic update using server time `$$NOW`: match `{status:'pending', runAt<=$$NOW}`, set `processing`, `lease{token, ownerId, expiresAt:$$NOW+leaseTTL}`, `$inc attempts`. All later writes are conditional on `lease.token`. Heartbeat extends during slow steps. Lease TTL 5 min (> SMTP timeout 30 s). Sweep lease: single `findOneAndUpdate` succeeding only if expired or already ours; first creation by upsert, duplicate key means someone else won; each acquisition increments `epoch`.

### 10.5 Delivery state machine
- In-app: attempt row `started` → insert Notification with `dedupeKey` → `accepted` (re-run after crash is harmless).
- Email: (1) begin-send transaction (7.5): recheck eligibility, fence, insert `started` row with `messageId`; (2) SMTP send with Message-ID `reminder.{reminderLogId}.{attempt}@{domain}`; (3) classify: accepted → `accepted`; failed before body (connect/auth/RCPT) or 4xx → `failed_retryable`; 5xx → `failed_permanent`; timeout/connection loss after transmission began, or crash after step 1 → `uncertain`. Anything not clearly pre-transmission is uncertain. Classification uses Nodemailer `code`, `command`, `responseCode`.
- Uncertain results are **never automatically retried by default**. Team gets an in-app notice; delivery log offers manual Resend (new attempt flagged manual, rate-limited, same begin-send, audit-logged).
- **Owner opt-in** `reminders.autoRetryUncertain` (default false): requires `confirmDuplicateRisk:true` after showing "An email with an uncertain outcome may already have reached the customer. Automatic retry can send a duplicate."; acknowledgement time and owner stored in settings and ActivityLog; Owner only. When on, uncertain attempts may retry under `maxAttempts` and backoff, each a new attempt through begin-send. It never converts uncertain into proof of non-delivery. Turning it off does not erase history or markers.
- `failed_retryable` retries use backoff (default 1 min, 5 min, 30 min, 2 h, 6 h, with jitter) up to `maxAttempts` (default 5), then `failed`.

### 10.6 Recovery and lateness
Lease-expiry recovery: `processing` rows with expired lease reset to `pending`, except an email attempt still `started` becomes `uncertain` (and sets the exposure marker atomically). Lateness: a reminder with `dueAt` older than `maxLatenessHours` (default 48) is skipped `stale`; after a long outage only the latest applicable overdue window sends. Sweep triggers (all in-process): one-minute tick while awake, startup sweep, throttled request-driven sweep after idle, manual "Run now" for owners/admins; all share one code path guarded by the sweep lease and logged in JobRun.

### 10.7 Visibility and retention
`GET /reminders/status` returns last successful run, due-but-unprocessed count, and counts of held/uncertain/failed/cancelled. UI shows plain-language health text. JobRun 60 days, delivery logs ~400 days; `customerEmailExposure` markers last the invoice's lifetime.

### 10.8 Hosting reality
Free web instances sleep; reminders are eventually delivered, not on time. Free hosting is for staging and evaluation. Production uses an always-on instance (19.4). DEPLOYMENT.md links current provider docs rather than quoting limits.

### 10.9 Customer email eligibility (first match wins)
| Step | Condition | Result |
|---|---|---|
| 1 | Invoice paid, cancelled, archived or zero-balance, or business reminders disabled | No email work; row skipped/cancelled with reason (terminal) |
| 2 | Config missing: SMTP not configured, business email disabled, no customer email, customer reminders off, or plan lacks email | Channel `not_applicable` with `reasonCode` (reversible) |
| 3 | Config satisfied but `sentAt` empty | Channel `held` (reversible) |
| 4 | Config satisfied and `sentAt` set | Channel `pending` |
`not_applicable` describes setup, never "waiting for Mark as sent". Eligibility keys on `sentAt`, not status. Re-evaluate steps 2 to 4 for non-terminal email channels on: reconcile sweep, SMTP/email setting change, customer email or preference change, Mark as sent, Unmark sent. Mark as sent: held → pending if within lateness else skipped `stale`. Held past the window → skipped `invoice_not_marked_sent`. In-app completes independently (row shows `partial` while email is held). Pre-send recheck is the begin-send transaction: step 1 → skipped/cancelled; step 2 → not_applicable; step 3 or fence matched nothing → held; step 4 and fence commits → send. Manual resend runs the same transaction and returns 422 `REMINDER_EMAIL_NOT_ELIGIBLE` unless step 4 matches.

### 10.10 Business reminders disabled
- Permanent for existing rows. `PATCH /settings/reminders` with `enabled:false` is refused with 422 `REMINDERS_DISABLE_CONFIRMATION_REQUIRED` (returns count) unless repeated as `confirmCancelPending` with the matching count. Dialog: "N scheduled reminders will be cancelled. Turning reminders back on will not restore them."
- On disable: record `enabled:false` and `disabledAt`; workers stop at once. Every non-terminal ReminderLog row (pending/processing/partial) becomes `cancelled` with `business_reminders_disabled`, channels `skipped`, in idempotent batches (correctness does not depend on batch completion because 10.9 step 1 reads the setting). A started email is not recalled. Nothing is materialised while disabled.
- On re-enable: set `enabledSince=now`. No cancelled row is reopened; only invoices finalized at or after `enabledSince` and rule keys with no row get reminders. Invoices finalized while disabled are never backfilled. Owner and Admin may change this.
- UI keeps "Send reminders" (terminal) separate from "Email customers" (`emailEnabled`, reversible).

---

## 11. Plans, trial and billing

### 11.1 Principles
1. **Compliance and data safety are never paywalled:** GST correctness, numbering, PDF download, recording payments on existing invoices and exporting existing records work on every plan and in every billing state.
2. Plans gate pages, volume and convenience, not correctness. Gates are enforced on the **server**; the UI only hides or locks for clarity.
3. Nothing is deleted because of billing.
4. Only a verified Razorpay webhook (or server-side signature check) changes entitlements.
5. **Important features are hidden from Basic users** (and from read-only users): the nav entries and pages are not shown at all, and direct API calls return `FEATURE_NOT_IN_PLAN` with `requiredPlan`. A single "Upgrade" entry shows what the higher plans unlock.

### 11.2 Plans (numbers live in `config/plans.json`; prices in INR before taxes; annual = 10 months for 12)
| | **Basic** | **Anointed** (mid) | **King** (high) |
|---|---|---|---|
| Monthly / annual | Rs 299 / Rs 2,990 | Rs 799 / Rs 7,990 | Rs 1,499 / Rs 14,990 |
| Finalized invoices per month | 30 | 300 | 3,000 (fair use) |
| Active customers | 50 | 1,000 | Unlimited |
| Team members incl. owner | 1 | 3 | 10 |
| Draft invoices | Unlimited | Unlimited | Unlimited |
| Dashboard | Basic cards | Full | Full |
| Customers, Invoices, Payments, PDF, Mark as sent, Duplicate, Cancel | Yes | Yes | Yes |
| GST engine, HSN policy, tax-rate versions | Yes | Yes | Yes |
| Logo on invoices | Yes | Yes | Yes |
| Expenses and categories | **Hidden** | Yes | Yes |
| In-app reminders and notifications | Due/overdue only | Full schedule | Full schedule |
| CSV reports (sales, payments, outstanding, overdue, customer balances) | **Hidden** | Yes | Yes |
| Receipt uploads | **Hidden** | 500 MB | 5 GB |
| Customer email reminders and invoice email | **Hidden** | **Hidden** | Yes |
| Cash-flow overview | **Hidden** | **Hidden** | Yes |
| Team roles (Admin, Accountant, Staff) | **Hidden** | Yes (3) | Yes (10) |
| Full data export | Own records | Yes | Yes |
| Support | Help center | Email | Email and chat |
| OCR scan to draft (release 1.1) | **Hidden** | **Hidden** | Yes |
Moving a feature between plans is a one-line change in `plans.json`.

### 11.3 Trial and states
- **14-day trial on King**, starting at onboarding completion, **no card**, verified email required, one trial per user (`User.trialUsedAt`) and per business. Reminders to the owner on day 7, 12 and 14 (in-app and email). Trial expiry is evaluated with the injectable clock.
- States: `trialing, active, past_due, halted, cancelled, expired`.
| State | Meaning | What works |
|---|---|---|
| `trialing` | within 14 days | everything on King |
| `active` | paid, current | everything in the plan |
| `past_due` | renewal failed, Razorpay retrying | everything for **7 days** grace, with banner |
| `halted` / `expired` | trial ended unpaid or retries exhausted | **Read-only**: view, download PDFs, record payments on existing invoices, export data. No new invoices, customers, expenses. Important features hidden. Nothing deleted |
| `cancelled` | owner cancelled | plan stays until `currentPeriodEnd`, then read-only |
- **No free tier after the trial.** An expired account stays read-only until the owner chooses a plan.
- Downgrade over limits keeps data; new creation is blocked with `PLAN_LIMIT_REACHED` until usage fits; surplus team members become `disabled` (owner picks). Upgrade applies immediately (Razorpay prorates); downgrade applies at period end.
- Entitlements are always computed server-side by `entitlements.service.js` from Subscription and `plans.json`.

### 11.4 Data model
- **Subscription** (unique `businessId`): planKey (basic|anointed|king), interval (month|year), status, trialStartedAt, trialEndsAt, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pendingPlanKey, razorpayCustomerId, razorpaySubscriptionId, lastPaymentAt, graceEndsAt.
- **BillingEvent** (append-only, TTL ~400 days): `razorpayEventId` (unique), type, subscriptionId, payloadHash, receivedAt, processedAt, outcome.
- **UsageCounter** (unique `(businessId, period)`): period `YYYY-MM` (business-local), finalizedInvoices, storageBytes.

### 11.5 Razorpay
- Razorpay **Subscriptions**; plans created per plan and interval, IDs in `plans.json`. Owner starts checkout in Settings → Billing; the backend creates the subscription; Checkout runs in the browser (the CSP allows Razorpay's script host on the billing page only).
- After checkout the server verifies the signature of `razorpay_payment_id`, `razorpay_subscription_id`, `razorpay_signature` with the key secret. The webhook is the source of truth.
- `POST /billing/webhooks/razorpay`: raw body; verify `X-Razorpay-Signature` with the webhook secret using constant-time comparison. Events: `subscription.authenticated, activated, charged, pending, halted, cancelled, completed`, `payment.failed`. Insert into BillingEvent first; a duplicate `razorpayEventId` is acknowledged and ignored. Handlers are idempotent and order-tolerant (state moves forward by timestamp).
- Invoice-limit counting: the Finalize transaction conditionally increments `UsageCounter.finalizedInvoices` (`< limit`); a refusal aborts with `PLAN_LIMIT_REACHED` and allocates no number.
- Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Test mode in staging, live in production. Secrets never reach the browser or logs.
- GST on InvoiceFlow's own subscriptions and the invoice issued to customers are for the owner's accountant. Pricing copy says "plus applicable taxes" until confirmed. Razorpay KYC and live activation are on the owner's side.

### 11.6 API
`GET /billing` (plan, state, usage, limits, trial days left); `POST /billing/checkout` (Owner); `POST /billing/change-plan` (Owner); `POST /billing/cancel` (Owner, with confirmation); `GET /billing/invoices`. Errors: `PLAN_LIMIT_REACHED` (402), `FEATURE_NOT_IN_PLAN` (402, with `requiredPlan`), `SUBSCRIPTION_READ_ONLY` (402), `BILLING_WEBHOOK_SIGNATURE_INVALID` (400), `TRIAL_ALREADY_USED` (409).

---

## 12. File storage (Cloudinary)
- `storage.service.js` has a provider interface: **local disk** (dev/tests) and **Cloudinary** (staging/production). No GridFS.
- Logos, receipts, scan images: Cloudinary `authenticated` type, folder `invoiceflow/{env}/{businessId}/{purpose}/`. Invoice PDFs: `raw`, `authenticated`, never public, **always served through the backend** (permission check, then short-lived signed URL or proxied stream). Landing imagery: a separate public folder.
- Server-side signed uploads only; no unsigned presets; magic-byte check, 5 MB cap for images, larger cap for PDFs, type allow-list. `publicId` must start with the caller's business folder, else 404. Invoice PDFs are never deleted by normal operations; logos and receipts may be replaced/deleted. `UsageCounter.storageBytes` enforces plan storage.
- Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`; staging and production use separate folders or accounts. Raw PDF storage in Cloudinary is workable but atypical; the interface lets PDFs move to S3-compatible storage later with no schema change.

---

## 13. Landing page
- Separate static site in `marketing/`, built with Vite and Tailwind v4 using existing pins. **No new runtime dependency.** Root domain on Vercel; the app on `app.` subdomain.
- Sections: hero ("Start 14-day free trial"), features, how it works (3 steps), screenshots, **pricing** (monthly/yearly toggle, read from `config/plans.json` at build time), FAQ, footer with Terms, Privacy, Refund/Cancellation, contact, status page, and the 5.9 disclaimer.
- Copy rules: claims check applies. Allowed: "GST-ready invoice fields", "you review and confirm tax settings". Never "GST compliant".
- Quality: responsive at 360/768/1280/1920, axe clean, Lighthouse targets recorded, `sitemap.xml`, `robots.txt`, Open Graph, no third-party tracking before consent. Trial button links to `/register?plan=trial`; no card is collected.

---

## 14. Project structure

### 14.1 Backend
```
backend/
  src/
    config/ env.js database.js cors.js scheduler.js plans.json
            gst-state-codes.json (incl. intraSecondTax) gst-hsn-rules.json
    modules/
      auth/ users/ businesses/ (business.*, membership.*, invitation.model.js)
      customers/
      invoices/ (invoice.*, invoice-number.service.js, clear-amounts.service.js,
                 invoice-delivery.{model,service}.js, delivery-fence.js)
      payments/ expenses/ (expense.*, expense-category.model.js)
      reminders/ (reminder-log.model.js, reminder-delivery.model.js,
                  reminder-eligibility.js [pure, 10.9], reminder.*)
      scheduler/ (job-run.model.js, job-lease.model.js, scheduler.*)
      billing/ (subscription.model.js, billing-event.model.js, usage-counter.model.js,
                billing.{service,controller,routes,validation,test}.js, razorpay.client.js)
      entitlements/ (entitlements.service.js, plans loader)
      dashboard/ cashflow/ reports/ notifications/ teams/
      settings/ (setting.*, tax-rate.{model,repository,service}.js [repo: insert and read only],
                 tax-rate-head.model.js)
      activity-logs/ duplicates/
    middlewares/ authenticate authorize entitlements validateRequest tenantContext idempotency
                 errorHandler notFound rateLimiter uploadMiddleware requestSweep requestId
    services/ email/ (email.service.js email.templates.js email.classify.js)
              pdf/ (pdf.service.js invoice.template.js invoice-pdfmodel.js amount-in-words.js)
              storage/ (storage.service.js local.provider.js cloudinary.provider.js)
    jobs/ index.js reminder.job.js reminder-reconcile.job.js overdue-invoice.job.js
          cleanup.job.js trial-expiry.job.js
    utils/ ApiError ApiResponse asyncHandler generateToken
           money.js financialCalculations.js gst.js invoiceNumber.js
           clock.js dateHelpers.js logger.js
    app.js server.js
  tests/ terminology.test.js setup.js integration/ security/ scheduler/ fixtures/
  assets/fonts/   (OFL font with rupee sign + licence)
  scripts/ verify-pins.mjs check-release-gate.mjs check-forbidden-claims.mjs claims-rules.json
  .env.example .gitignore .npmrc .nvmrc package.json package-lock.json README.md
  docs/ DEPLOYMENT.md DEPENDENCIES.md
        compliance/ REVIEW_PACK.md (generated) ACCOUNTANT_SIGNOFF.md (supplied at gate) claims-allowlist.json
```
`utils/money.js`: constants, limits, parse/format, BigInt helpers, `roundHalfUp`, `toSafeNumber`. `utils/gst.js`: GSTIN and HSN format, HSN policy evaluation, supply-type derivation, candidates helper. `utils/invoiceNumber.js`: format and length validation, FY label and range, counter key.

### 14.2 Frontend
```
frontend/src/
  app/ App.jsx router.jsx providers.jsx
  components/ ui/ (Button Input Select Modal Dropdown Tooltip Tabs Popover Badge Skeleton
                   EmptyState DataTable Pagination DatePicker[native] MoneyInput)
              layout/ (AppLayout Sidebar Header MobileNavigation PageContainer)
              shared/ (PageHeader SearchInput FilterBar ConfirmDialog LoadingState ProvisionalBanner
                       TrialBanner ReadOnlyBanner UpgradeCard)
  features/ auth onboarding dashboard customers invoices payments expenses reminders reports
            notifications settings billing cashflow team
  hooks/ useDebounce useMediaQuery usePermissions useEntitlements
  lib/ axios.js queryClient.js formatCurrency.js formatDate.js permissions.js money.js (same BigInt code)
  store/ authStore.js businessStore.js uiStore.js
  styles/ index.css theme.css
  main.jsx
marketing/   (landing site, section 13)
```
- Radix primitives are wrapped once in `components/ui` and never imported by features. `MoneyInput` parses with `parseMajorToMinor`; no float multiplication. The invoice preview uses the shared BigInt engine, labelled "preview".
- Navigation is built from entitlements: features not in the plan are **absent**, not greyed (11.1 rule 5).
- Invoice detail shows Finalize, Download PDF, Share, Mark as sent, Unmark sent separately with the delivery log and 7.2 wording; a refused unmark shows its reason. Reminder settings keep "Send reminders" apart from "Email customers". Settings show the FY start month as locked once a number exists, and the note that prefix/width changes apply from the next FY. Currency-change screen lists blocking drafts with Delete and Clear amounts (per draft and bulk with confirmation). `ProvisionalBanner` shows "calculation policy provisional" until a sign-off is recorded. No business switcher in the MVP.

---

## 15. API behaviour and error codes

### 15.1 General
Standard authenticated CRUD with pagination, sort, filter in the common envelope with `meta`. Idempotency-Key header on payments, Finalize, Mark/Unmark sent, invoice email.

### 15.2 Rule-carrying endpoints
- `POST /businesses` (onboarding) → 409 on race. `PATCH /businesses/current/currency` (Owner) → 409 `CURRENCY_LOCKED`, 422 `DRAFTS_REQUIRE_REVIEW`.
- `GET|POST /settings/tax/rates`; `POST /settings/tax/rates/:code/versions`. **No PATCH/PUT/DELETE for tax rates.** `GET|PUT /settings/tax/hsn-policy` (includes provisional notice).
- `PUT /settings/invoice` validates prefix and width (5.5/6.2); start-month change after first number → 409 `FINANCIAL_YEAR_START_MONTH_LOCKED`.
- `PATCH /settings/reminders`: disable needs `confirmCancelPending`; enabling `autoRetryUncertain` is Owner-only with `confirmDuplicateRisk:true` else 422 `UNCERTAIN_RETRY_DUPLICATE_RISK_CONFIRMATION_REQUIRED`; non-Owner → 403.
- `PATCH /invoices/:id` (drafts) accepts `reverseCharge` (never defaulted); `issueDate` outside FY range → 422. `DELETE /invoices/:id` (drafts). `POST /invoices/:id/clear-amounts` (needs preview confirmation token), `POST /invoices/clear-amounts` (bulk). `GET /invoices/:id/place-of-supply-candidates`. `POST /invoices/preview`.
- `POST /invoices/:id/finalize` (idempotent; delivers nothing) enforces the codes listed in 15.3 and allocates the number. No `/send` route.
- `GET /invoices/:id/pdf`; `POST /invoices/:id/mark-sent {via, sentAt, note}` (422 `INVOICE_NOT_FINALIZED` for drafts); `POST /invoices/:id/unmark-sent {note}`; `GET /invoices/:id/deliveries`. Tier 2: `POST /invoices/:id/email`, `POST /invoices/:id/deliveries/:deliveryId/resend`.
- Reminders: `GET /reminders/deliveries`, `POST /reminders/deliveries/:id/resend`, `GET /reminders/status`, `POST /reminders/run-now`. Billing: 11.6.
- No endpoint or field records a view.

### 15.3 Stable error codes
| Code | HTTP | Raised when |
|---|---|---|
| `AMOUNT_OUT_OF_RANGE` | 422 | negative, above `MAX_MONEY_MINOR`, or unsafe |
| `TAX_RATE_NOT_CONFIGURED` | 422 | no version in force on the tax-point date, or an end version |
| `TAX_RATE_VERSION_OUT_OF_ORDER` | 409 | new `effectiveFrom` not later than latest |
| `TAX_RATE_CHANGED_REVIEW_REQUIRED` | 409 | rate differs from what the user saw at Finalize |
| `TAXABLE_LINE_NOT_SUPPORTED_FOR_SUPPLY_TYPE` | 422 | taxable line on supply type `other` |
| `PLACE_OF_SUPPLY_REQUIRED` | 422 | Finalize without confirmed place of supply |
| `USER_ALREADY_HAS_BUSINESS` | 409 | second business |
| `CURRENCY_LOCKED` | 409 | change after finalized records |
| `DRAFTS_REQUIRE_REVIEW` | 422 | change while amount-holding drafts exist |
| `CURRENCY_MISMATCH` | 409 | draft saved under stale currency |
| `HSN_SAC_REQUIRED` / `HSN_SAC_TOO_SHORT` | 422 | policy says required and code missing / too short |
| `INVOICE_NUMBER_FORMAT_INVALID` | 422 | length/character violation or failed pre-commit assertion |
| `INVOICE_NUMBER_SERIES_EXHAUSTED` | 422 | sequence reached `maxSeq` |
| `FINANCIAL_YEAR_OUT_OF_RANGE` | 422 | FY start year outside 2000 to 2099 |
| `FINANCIAL_YEAR_START_MONTH_LOCKED` | 409 | start-month change after first number |
| `REVERSE_CHARGE_CONFIRMATION_REQUIRED` | 422 | Finalize with declaration unset |
| `REVERSE_CHARGE_NOT_SUPPORTED` | 422 | declaration `applies` or `unsure` |
| `INVOICE_NOT_FINALIZED` | 422 | delivery action on a draft |
| `UNMARK_SENT_NOT_ALLOWED` | 422 | outside 7.5 conditions |
| `EMAIL_NOT_CONFIGURED` | 422 | invoice email without SMTP |
| `REMINDER_EMAIL_NOT_ELIGIBLE` | 422 | manual resend when 10.9 step 4 does not match |
| `REMINDERS_DISABLE_CONFIRMATION_REQUIRED` | 422 | disabling without confirming count |
| `UNCERTAIN_RETRY_DUPLICATE_RISK_CONFIRMATION_REQUIRED` | 422 | enabling auto-retry without acknowledgement |
| `PLAN_LIMIT_REACHED` | 402 | plan volume limit hit |
| `FEATURE_NOT_IN_PLAN` | 402 | feature not in the plan (`requiredPlan`) |
| `SUBSCRIPTION_READ_ONLY` | 402 | write while read-only |
| `BILLING_WEBHOOK_SIGNATURE_INVALID` | 400 | bad Razorpay signature |
| `TRIAL_ALREADY_USED` | 409 | second trial |

---

## 16. Security checklist
Helmet and a **CSP header**; strict CORS allow-list; rate limits (global, auth, upload, manual resend, webhook) and per-tenant quotas; bcrypt cost 12; Zod `.strict()` everywhere; uploads checked by magic bytes, served only through authenticated endpoints; pino redaction (SMTP and Razorpay secrets, recipient masking); generic auth errors; hashed, expiring, single-use tokens; refresh rotation with reuse detection; **per-account lockout, session/device list with sign-out everywhere, breached-password check (k-anonymity range lookup), email-change re-verification**; CSV-injection guard; append-only audit log, tax-rate versions and delivery logs; no stack traces in production; constant-time comparison for webhook and job secrets; forbidden-claims CI check; install hygiene (exact pins, lockfile, `npm ci`); dependency and secret scanning in CI with reviewed updates only; external penetration test before production.

---

## 17. Testing strategy
Quality gate = these scenarios, not a coverage percentage.

### 17.1 Money and financial safeguards
Limit boundaries (`MAX_MONEY_MINOR` accepted, +1 rejected); `Number.MAX_SAFE_INTEGER`, NaN, Infinity, -0, negatives, floats, numeric strings, exponents rejected; BigInt: 10^9 x 10^13 → `AMOUNT_OUT_OF_RANGE`; 200 lines at ceiling rejected, 200 realistic lines accepted; every half-boundary for discounts and tax; 100% discount; discount > gross; zero-price lines; invoice-level discount allocation sums exactly for 1 to 200 lines; `parseMajorToMinor`/`parseQuantityMilli` valid and invalid cases for exponents 0, 2, 3; report aggregation with `totalMinorString`; **parity** fixture file runs on backend and frontend engines with identical output; seeded randomized sweep (fixed seed, thousands of invoices) asserts `cgst==sgst`, `tax==cgst+sgst+igst`, totals equal sum of lines, nothing negative, within limits.

### 17.2 GST
Intra → CGST+SGST (UTGST label for flagged territories), inter → IGST, unregistered → none; each category zero tax in the right bucket; taxable with no/zero rate rejected; place of supply (explicit choice required, basis stored, supply type follows confirmed state); `other` rejects taxable lines; charges (taxable, zero-rated, exempt, mixed-rate requires explicit choice, excluded from invoice discount). **Tax-rate versions:** resolution on the first date, day before, day of each `effectiveFrom`, after an end version; earlier/equal insert rejected; immutability (model rejects `updateOne`, `findOneAndUpdate`, `replaceOne`, `deleteOne`, save-after-change; static test that the repository has no update/delete; `contentHash` equal before and after later inserts); adding/ending versions or deleting all TaxRate docs does not change finalized invoices or their PDF view-model; drafts re-resolve; `TAX_RATE_CHANGED_REVIEW_REQUIRED`. Rounding worked example (10010 at 5% = 250+250 = 500, not 501); simulated `gst-calc-v2` leaves v1 invoices unchanged. GSTIN/HSN format; state-code data completeness incl. `intraSecondTax`. HSN policy by band and context, override stored, rules-file change does not alter finalized `hsnRequirement`. **PDF particulars:** view-model per scenario (intra, inter, exempt-only, mixed, charges, other supply, unregistered, ship-to differs) has every checklist row with value or explicit n/a; title rules; `amountInWords` with lakh/crore and zero paise; PDF smoke test with rupee glyph. **PDF archival:** re-download byte-identical; template change leaves old PDFs unchanged; forced render failure rolls back the number; stored hash matches file; orphan cleanup. Invoice numbers: characters, rollover at business-local midnight, no gap after forced rollback, no reuse after cancel, uniqueness under 20 parallel finalizations. Release gate script fails on missing sign-off, `calcVersion` mismatch, template-hash mismatch; passes only when all match.

### 17.3 One business per user and currency
20 parallel onboardings → exactly one business, others 409, no orphans (also with forced mid-transaction failure); direct second active membership fails at DB; invitation acceptance by an existing member rejected; disabling frees the slot; `MAX_BUSINESSES_PER_USER=2` gives slot 2 with no schema change. Currency: allowed on a new business and with only amount-free drafts; refused with `DRAFTS_REQUIRE_REVIEW` for same-decimals (INR→USD) and different-decimals (INR→JPY) pairs, archived drafts count, nothing modified; Clear amounts removes only documented fields with audit before-state; delete works; change then succeeds; amount-free drafts stamped; blocked after finalized invoice, payment (incl. reversed) or expense; concurrency: Finalize vs currency change (one wins), draft save vs currency change (`CURRENCY_MISMATCH` or refusal).

### 17.4 Scheduler and reminders
Fake SMTP transport and injectable clock. Exactly one in-app notification per due reminder; N parallel workers never process a row twice; stale-lease writes rejected; sweep lease has one winner (incl. first-ever upsert race), expired lease takeable, epoch increments; crash recovery (in-app re-run harmless; started email → uncertain, not retried by default); email outcomes (accepted; connect/RCPT/4xx retryable with backoff; 5xx permanent; timeout after transmission uncertain; team notified; manual resend creates new manual attempt; auto-retry only on Owner opt-in); deterministic Message-ID per `(reminderLogId, attempt)`; sleep/restart recovery; paid/cancelled/archived/zero-balance skipped; payment cancels pending rows; due-date change reschedules; lateness (`stale`, only latest overdue window); reconcile repairs missing rows and never recreates where a row exists in any status; IST, non-IST and DST zones; log completeness and no secrets in logs.

### 17.5 Delivery, status, unmark, fence, exposure
- **Delivery index:** 25 `pdf_download`, 5 `mark_sent`, 5 `unmark_sent`, 5 email attempts insert; duplicate email attempt number rejected (E11000), same number on another invoice/business accepted; validator rejects email without `attempt` and others with `attempt`; `listIndexes` shows `partialFilterExpression {method:'email'}` and `businessId`; two parallel email attempts yield 1 and 2; TTL removes only `pdf_download`.
- **Channel states:** unsent + no SMTP → `not_applicable(smtp_not_configured)` never held; other missing config → matching `reasonCode`; full config unsent → held; sent → pending; issued-never-sent gives on-time in-app notification, held email, no SMTP call; SMTP configured later moves not_applicable → held, Mark as sent → pending, email sends once; losing customer email → not_applicable; Mark as sent after window → skipped `stale`; partially_paid with empty `sentAt` stays held; held past window → skipped `invoice_not_marked_sent`; pre-send recheck cases (unmark between claim and send → held; SMTP removed → not_applicable; payment → skipped; reminders disabled → cancelled; none touch the SMTP double); terminal channels never reopened; manual resend on ineligible → `REMINDER_EMAIL_NOT_ELIGIBLE`.
- **Unmark rules:** manual only succeeds with `unmark_sent` row carrying reversed IDs and audit before-state; email accepted then manual → `sent_by_email`; manual then accepted invoice email → refused; manual then accepted/uncertain reminder email → `customer_email_accepted` / `customer_email_uncertain`; uncertain invoice email refused; `failed_*` do not block; partially paid/paid → `has_payments`; non-sent → `not_sent`; after unmark only unclaimed pending email channels return to held and all other channels and every ReminderDelivery are byte-identical; repeated key records once; re-marking moves held → pending inside the window.
- **Durable exposure:** accepted/uncertain outcomes update the delivery row and invoice marker in one transaction (incl. lease-expiry recovery); forced failure leaves both unchanged; marker set once, never overwritten or cleared by unmark/resend/retry/archive/settings; after deleting the ReminderDelivery row (and with the TTL physically removing it) unmark still returns the marker reason; accepted takes precedence; failed outcomes set nothing.
- **Auto-retry opt-in:** default false for new and existing businesses; enabling without `confirmDuplicateRisk` refused and changes nothing; non-Owner cannot enable; Owner confirmation stores time and actor and audits; when on, retries obey limits and backoff with distinct attempt numbers and deterministic Message-IDs and pass begin-send and fence; turning off preserves history and markers.
- **Fence races (>= 200 iterations, both start orders, injected delay between check and commit):** invoice email vs unmark and reminder email vs unmark each end in exactly one serial order (started row + `email_in_flight` refusal, or unmark first and begin-send matches nothing/starts fresh from issued); never an unmark committed while a started/accepted/uncertain email row exists; SMTP double call count equals started rows and no call for an invoice with empty `sentAt`; acceptance races refused in both orders; lease-expired started row becomes uncertain and still blocks; `processing` with no started row does not block; payment/cancellation vs begin-send conflict on the Invoice; fence monotonic (+1 per begin-send and unmark, unchanged on refusal); rollback tests; **regression guard** (a double that removes the fence increment fails the interleaving test); started emails are never recalled.
- **Reminders disabled:** without matching `confirmCancelPending` → refused with count; with it, all pending/processing/partial rows cancelled with `business_reminders_disabled`, terminal rows and delivery rows byte-identical, audit entry; processing row cancelled by its own recheck; started email completes; Finalize and reconcile create no rows while disabled; re-enable reopens nothing, only invoices finalized at or after `enabledSince` and rule keys without rows; no backfill; reversible conditions (customer off, SMTP removed, customer email cleared) are re-evaluated; disable vs worker claim race leaves no new started row.
- **Status:** Finalize yields issued with empty `sentAt` and no delivery rows; PDF download changes no status and appends exactly one event; Mark as sent yields `sent/user_declared`; repeated key records once; second delivery logged without changing `sentAt`; delivery actions on drafts → `INVOICE_NOT_FINALIZED`; payment on never-sent invoice leaves `sentAt` empty; email accepted → `email_accepted`, failures leave issued; PDF view-model identical before/after Mark as sent; reminders created at Finalize; dashboard issued-not-sent count matches fixtures; schema test: no `viewed` status or `firstViewedAt`, API rejects `viewed`, no UI string says "viewed".
- **Reverse charge:** `unset` / `applies` / `unsure` allocate no number, store no snapshot, create no reminder; `not_applicable` finalizes with audit; server never defaults it, duplicates start `unset`; PDF line only for confirmed `not_applicable`.
- **Tax-rate concurrency:** two inserts (July, October) behind a barrier in both orders with injected delay, >= 200 iterations: chain strictly increasing, July never after October, loser gets `TAX_RATE_VERSION_OUT_OF_ORDER`; 20 parallel shuffled inserts; equal dates (one commits); 20 parallel first inserts (one head); regression double that no-ops the head fails; rollback leaves head and versions unchanged; integrity check flags a direct insert; different codes/businesses do not contend.
- **Financial year and numbering:** FY label cases and boundaries for IST and a non-IST zone; start months 1, 4, 7 incl. January quirk; labels pairwise unique 2000 to 2099; 2100-04-01 and 1999-12-31 → `FINANCIAL_YEAR_OUT_OF_RANGE` at draft save and Finalize with no counter touched; start-month lock and its race; length matrix over prefix 1 to 5 and every W (never > 16 chars); prefix of 5 with W=7 rejected; counter at 999,998 allocates `ABCDE2627-999999` (16 chars) and the next Finalize → exhausted with counter unchanged; 5 parallel finalizations at max-1 → one success, four exhausted; forced rollback keeps the number available; cancelling the max number does not free it; new FY restarts at 1; mid-year prefix/width change applies next FY; 90% warning once.
- **Forbidden claims:** must fail: "GST compliant invoices", "Fully compliant with GST law", "Not only fast but GST compliant", "Certified by your accountant". Must pass: "InvoiceFlow does not guarantee GST compliance", "Invoices are not certified as compliant", the allowlisted disclaimer, a `docs/**` policy document. Altered allowlisted sentence fails; missing disclaimer in tax settings/export header/README/landing fails; built-bundle scan catches an injected claim. **Terminology:** `terminology.test.js` fails on a "Send invoice" label, a `/send` route, a status label implying receipt, or Finalize used for delivery.

### 17.6 Billing and entitlements
Plan matrix: every gated route and page against all plans and states (registry-driven; an ungated new route fails the build); hidden nav entries absent for Basic and read-only; webhook valid/invalid signature, duplicate event, out-of-order events, replay; trial day 0, 13, 14 boundaries with the injectable clock; one trial per user; plan-limit race (20 parallel Finalize at limit-1 → exactly one success, no number gap); read-only still allows PDF download, payments on existing invoices and export while blocking creation; downgrade over limits keeps data; claims check covers pricing and billing copy.

### 17.7 Existing layers
Backend unit (permission matrix, balance/status derivation, duplicate rules); integration against an in-memory replica set with no mocked business logic; tenant isolation (seeded Business A/B; route-registry-driven suite hits every tenant-owned route, 404 for foreign IDs, `businessId` injection ignored, both directions, includes file endpoints; an unregistered route fails the build); concurrency (parallel payments never overpay; repeated idempotency keys record once). Frontend: forms, Radix dialog/dropdown focus and keyboard, permission UI, loading/error/empty states, money input parsing, reminder-health banner, currency-change flow, unmark refusal reasons, reminders-disable confirmation, plan gating. E2E (Playwright): register, onboard (INR, GST), customer, invoice with HSN and CGST/SGST, answer reverse-charge, Finalize, download PDF, Mark as sent via WhatsApp (wording "Marked as sent by you"), partial payment, balance, final payment, Paid, dashboard; inter-state shows IGST; add a tax-rate version and confirm an old invoice is unchanged; currency change with a priced draft completed via Clear amounts; Mark as sent by mistake then Unmark; disable reminders with confirmation and confirm re-enable restores nothing; trial → plan purchase in Razorpay test mode → downgrade; unauthorised access; mobile viewport. Accessibility: axe on main pages.
**Install hygiene (CI):** `npm ci` from lockfile; `verify-pins` finds no ranges and no drift against `docs/DEPENDENCIES.md`; `npm ls` clean; lockfile unchanged after install; engines check.

---

## 18. Dependencies and reproducible installs

### 18.1 Provenance and Step 0
Versions below come from a registry check (`npm view`, 2026-10-30). Phase 1 begins with **Step 0**: re-run `npm view` for every row, re-read peer ranges and engines, stop if anything is missing. Step 0 also selects and pins the **new packages**: `razorpay`, `cloudinary`, a migration tool, an error-tracking SDK (both apps), and later a TOTP library (Tier 2). **Never guess a version.**

### 18.2 Runtime
Node **>= 22.22.2** (required by `jsdom@30.1.3` ^22.22.2 and `eslint@10.13.0` ^22.13.0; `vitest@5`, `msw@3`, `@axe-core/playwright@4` need >= 22.12). Declared in each `package.json` `engines`, `.nvmrc`, and the Render and Vercel Node version. Mongoose 9 and mongodb-memory-server need >= 20.19.

### 18.3 Reproducibility policy
Every dependency is an exact version. Installs use `--save-exact`; `.npmrc` has `save-exact=true`, `engine-strict=true`, `package-lock=true`. Commit `package.json` and `package-lock.json` for backend and frontend. CI, Render and Vercel use `npm ci`. `docs/DEPENDENCIES.md` mirrors the tables; `scripts/verify-pins.mjs` fails CI on any range, missing entry or mismatch. A dependency changes only through one reviewed change updating table, `package.json` and lockfile together. `npm audit` is reviewed and recorded, never triggers an unreviewed upgrade. Playwright browsers are tied to the pinned `@playwright/test`.

### 18.4 Backend pins
Dependencies: `express@5.3.0 mongoose@9.11.4 zod@4.6.7 jsonwebtoken@9.0.3 bcrypt@6.0.0 helmet@8.3.0 cors@2.8.6 cookie-parser@1.4.7 express-rate-limit@8.7.2 morgan@1.12.1 pino@10.4.0 nodemailer@10.3.1 multer@2.5.0 node-cron@4.6.0 pdfkit@0.20.2 csv-stringify@6.9.0` plus the Step 0 packages (razorpay, cloudinary, migration tool, error SDK).
Dev: `vitest@5.0.5 @vitest/coverage-v8@5.0.5 supertest@7.3.1 mongodb-memory-server@11.3.0 eslint@10.13.0 @eslint/js@10.0.1 globals@17.13.0 eslint-config-prettier@10.1.8 prettier@3.9.10 pino-pretty@13.2.0`.
```
cd backend && npm init -y
npm install --save-exact express@5.3.0 mongoose@9.11.4 zod@4.6.7 jsonwebtoken@9.0.3 bcrypt@6.0.0 helmet@8.3.0 cors@2.8.6 cookie-parser@1.4.7 express-rate-limit@8.7.2 morgan@1.12.1 pino@10.4.0 nodemailer@10.3.1 multer@2.5.0 node-cron@4.6.0 pdfkit@0.20.2 csv-stringify@6.9.0
npm install --save-exact --save-dev vitest@5.0.5 @vitest/coverage-v8@5.0.5 supertest@7.3.1 mongodb-memory-server@11.3.0 eslint@10.13.0 @eslint/js@10.0.1 globals@17.13.0 eslint-config-prettier@10.1.8 prettier@3.9.10 pino-pretty@13.2.0
```

### 18.5 Frontend pins
Dependencies: `react@19.3.1 react-dom@19.3.1 react-is@19.3.1 react-router-dom@7.18.5 axios@1.21.0 @tanstack/react-query@5.105.0 zustand@5.0.16 react-hook-form@7.91.0 @hookform/resolvers@6.0.2 zod@4.6.7 recharts@3.10.1 lucide-react@1.64.0 motion@14.8.0 sonner@2.0.8 date-fns@4.4.0 @date-fns/tz@1.5.0 clsx@2.1.1 tailwind-merge@3.7.0`.
Radix: `@radix-ui/react-dialog@1.3.1 @radix-ui/react-alert-dialog@1.2.1 @radix-ui/react-dropdown-menu@2.2.1 @radix-ui/react-tooltip@1.4.1 @radix-ui/react-select@2.4.1 @radix-ui/react-tabs@1.2.1 @radix-ui/react-popover@1.3.1`.
Dev: `vite@8.3.5 @vitejs/plugin-react@6.1.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 vitest@5.0.5 jsdom@30.1.3 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.8 msw@3.0.3 @playwright/test@1.64.1 @axe-core/playwright@4.14.0 eslint@10.13.0 @eslint/js@10.0.1 globals@17.13.0 eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.7 eslint-config-prettier@10.1.8 prettier@3.9.10`.
```
cd frontend && npm init -y   # no scaffold generator; files written by hand
npm install --save-exact react@19.3.1 react-dom@19.3.1 react-is@19.3.1 react-router-dom@7.18.5 axios@1.21.0 @tanstack/react-query@5.105.0 zustand@5.0.16 react-hook-form@7.91.0 @hookform/resolvers@6.0.2 zod@4.6.7 recharts@3.10.1 lucide-react@1.64.0 motion@14.8.0 sonner@2.0.8 date-fns@4.4.0 @date-fns/tz@1.5.0 clsx@2.1.1 tailwind-merge@3.7.0 @radix-ui/react-dialog@1.3.1 @radix-ui/react-alert-dialog@1.2.1 @radix-ui/react-dropdown-menu@2.2.1 @radix-ui/react-tooltip@1.4.1 @radix-ui/react-select@2.4.1 @radix-ui/react-tabs@1.2.1 @radix-ui/react-popover@1.3.1
npm install --save-exact --save-dev vite@8.3.5 @vitejs/plugin-react@6.1.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 vitest@5.0.5 jsdom@30.1.3 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.8 msw@3.0.3 @playwright/test@1.64.1 @axe-core/playwright@4.14.0 eslint@10.13.0 @eslint/js@10.0.1 globals@17.13.0 eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.7 eslint-config-prettier@10.1.8 prettier@3.9.10
npx playwright install --with-deps chromium
```
`@types/*` peers are optional (no TypeScript types pulled in). `marketing/` reuses the frontend's Vite and Tailwind pins and adds no runtime dependency.

### 18.6 Phase 1 dependency acceptance (mandatory, clean checkout)
1. Step 0 complete; no TBD or placeholder remains.
2. Install uses the exact commands; `verify-pins` passes; lockfiles committed for both apps.
3. Remove `node_modules`, `npm ci` succeeds in both apps; `npm ls --all` exits 0 (no missing, invalid, extraneous, unmet-peer); `git diff --exit-code` on the lockfile is clean; a second CI job on a fresh runner produces an identical `npm ls --all --json` tree.
4. Backend smoke: boot with env validation; `GET /health`; `MongoMemoryReplSet` starts and a transaction commits and rolls back; Zod parses; bcrypt hashes/verifies; pino logs with redaction; Nodemailer JSON transport sends; PDFKit renders a page with the rupee sign using the bundled font; node-cron schedules and stops; multer and csv-stringify import; BigInt money tests pass.
5. Frontend smoke: `vite build`; `vite preview` serves; Vitest/jsdom renders a Radix Dialog with a Tailwind class; an MSW handler intercepts; react-hook-form validates through resolvers with Zod 4; Playwright launches Chromium, loads the preview and runs axe; the shared BigInt money module passes the parity fixtures in the browser engine.
6. **Fallback rule:** if a package fails install or a smoke test, try its previous major, regenerate the lockfile, re-run items 3 to 5, and record the change in `docs/DEPENDENCIES.md` and the phase summary. A fallback that raises the Node minimum above 22.22.2 needs owner approval.

### 18.7 Phase 13 only (OCR)
`tesseract.js@7.0.0`, `pdf-parse@2.4.5` (Node >= 22.3 on the 22 line), same pin policy, installed when Phase 13 begins.

### 18.8 Deliberately not added
Date-picker library, form-UI kit, other icon packs, jsPDF, dotenv, monorepo tool, property-testing library (a seeded loop is used), PDF text-extraction library before Phase 13, a landing-page framework.

---

## 19. Production readiness (release gates for Phase 12)
1. **PDF archival** (6.3).
2. **Backups and DR:** paid MongoDB tier with point-in-time restore; RPO and RTO recorded in DEPLOYMENT.md; a **restore drill** into a scratch cluster is a gate; periodic Cloudinary manifest export.
3. **Observability:** request ID on every log line and response header; error tracking on both apps; uptime monitor; alerts on job lag, error rate, webhook failures and trial-expiry job failures.
4. **Hosting:** always-on backend in production; separate staging and production databases, Cloudinary folders, Razorpay modes and secrets. Free instances are staging only.
5. **Email deliverability** (needed for trial and billing notices even without Tier 2 customer email): transactional provider, SPF, DKIM, DMARC, bounce and complaint handling.
6. **Security process:** dependency and secret scanning, CSP, penetration test.
7. **Migrations:** versioned migration tool with a documented rollback procedure (pinned via Step 0).
8. **Support console:** minimal audited internal console for documented procedures (currency unlock, series continuation, trial extension); read-mostly; impersonation logged. (Tier 2.)
9. **Data export and quotas:** self-service full data export; per-tenant rate limits and quotas.
10. **Legal and privacy:** Terms, Privacy Policy, refund and cancellation policy, data-subject requests, retention versus deletion policy, breach-response steps. **Content comes from the owner's counsel or accountant, not from the coding agent.**
11. **Runbooks and status page:** one-page runbooks for DB failover, stuck scheduler, SMTP outage, Razorpay webhook outage, bad deploy; public status page; load test of Finalize and reports at realistic sizes with an index review.
12. **Accountant sign-off gate** (5.10).

---

## 20. MVP scope

**Tier 1 (release 1.0 gate; all done, tested, deployed):** auth (register, login, logout, refresh, forgot/reset password, change password, profile, email verification, hardening); onboarding (business, INR default, GST details, single business per user); currency rules; customers; invoices (server-side calculations, unit, HSN policy, CGST/SGST/UTGST/IGST, taxability, place of supply, reverse-charge declaration, append-only tax rates, charges, numbering at Finalize, statuses, Finalize, PDF with archival, sharing helpers, Mark/Unmark sent with delivery history, duplicate, cancel, list, filter); payments (record, partial, reversal, history, idempotency); expenses and categories; in-app reminders and notifications with the full scheduler and the enable/disable lifecycle; dashboard; CSV reports; light/dark theme, responsive shell, accessibility, role enforcement; **plans, 14-day trial, Razorpay subscriptions, entitlements, read-only mode**; **Cloudinary storage**; **landing page**; tenant-isolation, financial, GST, numbering, billing and scheduler test suites; production-readiness items 19.1 to 19.7, 19.9 to 19.12 (19.4, 19.6 and 19.11 load testing apply to production release).

**Tier 2 (decided at the Phase 9 checkpoint, none a gate):** customer email reminders and invoice email (SMTP) with full uncertain-delivery handling; team invitations and role UI; cash-flow overview; receipt upload; PDF report exports; customer CSV export; duplicate warnings; sample data; recurring expenses; owner TOTP; support console.

**Tier 3 (later):** OCR (release 1.1), review-only GST summary export, recurring invoices, credit notes and overpayment credit, multiple businesses per user, "follow principal supply" charge allocation, reverse charge, cess, export/SEZ with tax payment, digital signature, WhatsApp, payment links, bank reconciliation, currency conversion, customer portal with view tracking, self-service continuation series, i18n, coupons, referrals, usage add-ons, enterprise plan.

---

## 21. Development roadmap
Each phase ends with: tests green, docs updated, a short summary, then the owner's go-ahead.

| Phase | Tier | Deliverable | Done when |
|---|---|---|---|
| 1 Foundation | E | Step 0 registry re-check; hand-written scaffolds incl. `marketing/` skeleton; env validation, DB connection, error handler, logger with request IDs, Vitest, Tailwind v4 tokens; `money.js`, `gst.js`, `financialCalculations.js`, `invoiceNumber.js` (FY label, range, exhaustion arithmetic), `clock.js` with the money, GST arithmetic, rounding, numbering and HSN-policy test suites; `verify-pins`; `docs/DEPENDENCIES.md`; forbidden-claims check with fixtures; terminology test skeleton; `config/plans.json` skeleton; `.nvmrc` and `engines` at 22.22.2; migration tool and scanning config | 18.6 passes; `npm test` green; `/health` OK; frontend renders |
| 2 Auth and onboarding | E | Users, tokens, memberships with `(userId,slot)` index, auth hardening (lockout, sessions, breached-password check), onboarding transaction (incl. `reminders.enabledSince`, Subscription trial), currency rules, tax-rate seeding with heads, `tenantContext`, `authorize` | Race test and first isolation tests pass |
| 3 App shell | E | Layout, Radix-based primitives, theme, motion, skeletons, empty states, `ProvisionalBanner`, trial and read-only banners, entitlement-driven nav | Responsive checks at 360/768/1280/1920; axe clean |
| 4 Customers | E | CRUD, GSTIN and state validation | Customer tests incl. IDOR pass |
| 5 Invoices and PDF | E | Finalize (numbering with FY range/width/exhaustion, snapshots, start-month lock, PDF archival, usage increment), delivery recording and fence, reverse-charge declaration, GST engine, place-of-supply flow, append-only tax rates with TaxRateHead, HSN policy, charges, statuses, clear-amounts/delete for drafts, PDF view-model and renderer with bundled font, storage provider interface (local + Cloudinary), list/detail/edit | GST, rate-version (incl. concurrency), HSN, numbering, reverse-charge, delivery/status, delivery-index, unmark and fence tests, PDF particulars and smoke tests, archival tests, calc parity pass |
| 6 Payments | E | Transactional record and reverse, idempotency, `hasFinalizedRecords` | Overpay, race, currency tests pass |
| 7 Expenses | E | Categories, CRUD, receipts via Cloudinary | Tests pass |
| 8 Reminders and notifications | E (+O email) | Scheduler, ReminderLog, leases, recovery, in-app notifications, health banner, enable/disable lifecycle, eligibility; email channel only if chosen | Scheduler, eligibility and disabling tests pass; reminder-side exposure tests if email chosen |
| 9 Reports and dashboard | E | CSV reports, dashboard | Totals reconcile with fixtures. **Checkpoint: owner picks Tier 2 items** |
| **9A Billing and entitlements** | E | Razorpay subscriptions and webhooks, entitlements middleware, usage counters, plan gating UI, read-only mode, trial expiry job | Billing tests (17.6) pass in Razorpay test mode |
| **9B Landing page** | E | Pricing from `plans.json`, SEO, claims scan, axe | Landing checks pass |
| 10 Selected Tier 2 items | O | Only the picked items | Each item's tests pass; skipped items leave no dead code |
| 11 MVP QA | E | Playwright E2E, security review, accessibility, performance, load test, runbooks, privacy and legal drafts, pen-test scope, generate `REVIEW_PACK.md` and hand it to the accountant | Full suite green; review pack complete |
| 12 MVP deployment (release 1.0) | E | Atlas, Render, Vercel, CORS, smoke tests, backups with restore drill, error tracking, uptime and alerts, always-on hosting, staging/production split, email DNS, status page, Razorpay live mode, Cloudinary production. Staging may precede sign-off; production needs `ACCOUNTANT_SIGNOFF.md` and a green gate script; built-bundle claims scan runs | Gate green; smoke-tested on production URLs; accepted by owner |
| 13 OCR (release 1.1) | later | After Phase 12 acceptance: 13a build (worker-thread Tesseract, ScanDraft, review UI, manual fallback); 13b scanner QA and 1.0 regression; 13c deploy | Confirm-only persistence test, regression suite, deployed and smoke-tested |

---

## 22. Items for owner confirmation (approving this document approves them)
1. Currency locks after any non-draft invoice, payment or expense; drafts are never relabelled; change refused while any draft holds an amount.
2. Limits: `MAX_MONEY_MINOR` 10^13, quantity up to 1,000,000.000, 200 lines, 10 charges.
3. `gst-calc-v1` rounding is PROVISIONAL; accountant validation is a mandatory pre-production gate; no compliance claims anywhere.
4. Invoice-level discount applies to item lines only. 5. Charge tax treatment is chosen per charge. 6. Supply type `other` supports only non-taxable categories.
7. Seeded tax rates (5%, 18%, 40%) are editable starting points, non-authoritative.
8. HSN/SAC is a configurable policy; seeded default "recommended, 4 digits"; format validation always applies.
9. Uncertain emails are never retried automatically by default; Owner may opt in after a duplicate-risk acknowledgement; reminder emails also need the invoice marked as sent.
10. Reminder lateness 48 hours; reminder time 09:00 business-local.
11. Phase numbering as in section 21. 12. **Node >= 22.22.2** (approved).
13. Tax-rate versions are append-only and must start later than the latest existing one.
14. Invoice numbers: allocated at Finalize, FY series (April start), at most 16 characters, exhaustion has no self-service remedy, cancelled numbers never reused.
15. PDF particulars as in 6.1, reverse-charge line only after explicit confirmation, UTGST per reference data, unit of measure, bundled OFL font; all on the accountant list.
16. **You arrange a qualified accountant reviewer before Phase 11 ends.** Production release waits for sign-off; staging does not.
17. Dependency fallback to the previous major is reported without asking, unless it raises the Node minimum above 22.22.2.
18. Tax-rate inserts are serialized per code by TaxRateHead, proven by a concurrency test.
19. Reverse charge needs an explicit per-invoice answer; `applies`/`unsure` blocks Finalize.
20. Finalize is not sending; Sent means declared or server-accepted, never proof of receipt; PDF download, sharing helpers and Mark as sent are essential; email is Tier 2.
21. No `viewed` status in 1.0. 22. InvoiceDelivery uniqueness applies to email attempts only.
23. Customer reminder emails are held only when otherwise eligible and `sentAt` is empty; missing config is `not_applicable`.
24. Terminology as in 7.4. 25. Forbidden-claims check is scoped and negation-aware; it does not replace accountant review of copy.
26. Unmark sent is allowed only when the sent state came solely from manual declarations; any started, accepted or uncertain customer email blocks it, with sticky invoice-level markers that outlive the 400-day delivery log TTL.
27. An uncertain customer email permanently blocks Unmark sent. 28. The January-start label quirk stays on the accountant list. 29. The FY start month locks after the first number.
30. Email transmission and unmark are mutually exclusive via the atomic fence; a started email is never recalled.
31. **Disabling business reminders is permanent for existing rows; re-enabling never reopens them; invoices finalized while disabled are not backfilled.**
32. FY encoding unchanged: `YY(start)+YY(start+1)`, start years 2000 to 2099.
33. ReminderDelivery may expire after ~400 days; Unmark protection does not.
34. **Stored PDF at Finalize** (6.3) is adopted.
35. **Plans and prices** in 11.2 are approved as written; **important features are hidden from Basic users** and from read-only users.
36. **14-day trial on King, no card, one per user; after an unpaid trial the account is read-only, never deleted; no free tier.**
37. 7-day grace after a failed renewal before read-only.
38. Compliance and data safety are never paywalled.
39. **Cloudinary** replaces GridFS; invoice PDFs are private and served only through the backend.
40. The landing page is a separate static site with no new runtime dependency.
41. Production requires a paid backed-up database with a restore drill, always-on hosting, error tracking, a penetration test and legal documents from the owner's counsel.
42. Owner-side tasks outside the code: Razorpay KYC and live activation, domain, email provider, accountant reviewer, and the decision on GST for InvoiceFlow's own subscription invoices.

---

## 23. What happens next
On the owner's "approved":
1. Phase 1 Step 0: re-check every pin and select the new packages (razorpay, cloudinary, migration tool, error SDK); record them.
2. Write `docs/DEPENDENCIES.md` with all pins and the Node 22.22.2 minimum.
3. Hand-write both scaffolds and the `marketing/` skeleton; install with `npm ci` using the commands in 18.4 and 18.5.
4. Build the money, GST, numbering and calculation modules with their tests.
5. Run the 18.6 acceptance and report. **Stop and wait for the go-ahead before Phase 2.**
