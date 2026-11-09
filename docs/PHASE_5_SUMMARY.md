# Phase 5: Invoices and PDF

## Completed

- Added tenant-scoped invoice create, list, detail, draft edit, clear-amounts, delete, archive, finalize, PDF download, and status-recording routes under `/api/invoices`.
- Finalization allocates a financial-year invoice number and increments the tenant usage counter in a MongoDB transaction. It snapshots the selected customer and business, stores tax calculation versions, locks currency and financial-year settings, and supports idempotent replay.
- Added GST line and charge calculations, place-of-supply selection, effective-dated append-only tax-rate versions with `TaxRateHead`, HSN/SAC policy evaluation, and an explicit reverse-charge declaration. Unsupported or uncertain reverse-charge situations remain drafts.
- Added append-only delivery history, manual sent-status recording, a delivery fence for Unmark, private PDF download events with their retention index, and the PDF archive integrity hash.
- Added a PDF view model and renderer using the bundled Noto Sans font, draft labelling, tax particulars, and Indian amount-in-words output.
- Added private local disk storage as the default and an optional authenticated Cloudinary provider. Cloudinary is never selected unless `INVOICE_STORAGE_PROVIDER=cloudinary` and all credentials are provided.
- Connected the authenticated app shell to customer create/list and invoice create, draft edit, place-of-supply confirmation, finalization, PDF download, and manual sent-status workflows. The interface clearly distinguishes finalization from external delivery.
- Updated root and backend setup/API documentation.

## Verification

- Backend suite: 93 tests pass across 12 files, including invoice tax, concurrent rate versioning, HSN policy, numbering, delivery state and fence, tenant isolation, PDF archival and smoke tests, and calculation parity.
- Frontend suite: 23 tests pass across 7 files.
- Backend and frontend ESLint pass.
- Prettier checks pass for backend and frontend source.
- Forbidden-claims scan passes.
- Frontend production build succeeds. Vite reports the existing main-bundle size advisory (>500 kB).

## Scope notes

- Local filesystem storage remains enabled by default; the optional cloud provider requires the owner to configure it.
- InvoiceFlow does not transmit invoices by email in this phase. “Mark as sent” records the user's own declaration.
- Payments, reminders, and production release remain later roadmap phases.

Phase 5 is complete. Phase 6 has not started and requires the owner's approval.
