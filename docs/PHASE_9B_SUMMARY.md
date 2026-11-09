# Phase 9B: Landing page

## Delivered

- Built a separate responsive static marketing site in `marketing/` using the already-pinned Vite and Tailwind packages; no package was added.
- Added product overview, three-step workflow, an actual app dashboard screenshot generated with sample records, an illustrative interface preview, FAQ, GST disclaimer, pricing cards, and monthly/yearly selection.
- Marketing prices, invoice limits, and customer limits come from `backend/src/config/plans.json` at build time. CTAs link to `/register?plan=trial` on the configured app host; the app now accepts that registration alias.
- Added page title and description, canonical and Open Graph metadata, local favicon/share image, generated `sitemap.xml`, and `robots.txt`.
- No analytics, advertising, or third-party tracking code is loaded.
- Added owner-supplied-content placeholders for Terms, Privacy, Refund/Cancellation, Contact, and Status. The landing page does not invent legal copy or account contact information.

## Verification

- Marketing Vite production build passed.
- Marketing Playwright checks passed: pricing values and yearly toggle, metadata, trial URL, axe accessibility, and no horizontal overflow at 360/768/1280/1920px.
- The marketing screenshot depicts the real dashboard UI with fictional sample data; the image alt text and caption say the records are examples.
- Lighthouse targets are recorded in `marketing/README.md`; Lighthouse scores were not collected locally.
- Owner must replace the reserved `.example` marketing/app URLs and provide legal, contact, and status details before publishing.

Phase 9B is implemented and locally verified. Phase 9A's Razorpay test-mode verification remains pending as recorded in `docs/PHASE_9A_SUMMARY.md`. No later phase has started.
