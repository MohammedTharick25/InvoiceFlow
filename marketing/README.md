# InvoiceFlow marketing site

This static landing page is built with the frontend's pinned Vite and Tailwind toolchain. It adds no package or third-party runtime service. Plan prices and limits are imported from `backend/src/config/plans.json` during the build; the monthly/yearly switch uses those registry values. The page does not load analytics, advertising, or other third-party trackers.

## Local build and acceptance checks

From `frontend/`:

```powershell
npm run capture:marketing:screenshots
npm run build:marketing
npm run test:e2e:marketing
```

The screenshot command captures the actual app dashboard with clearly identified sample records into `marketing/public/`. The marketing Playwright checks run the built static site in Chromium, check its pricing, metadata and screenshot asset, run axe, and check horizontal overflow at 360, 768, 1280, and 1920 pixels.

## Before deployment

Copy `.env.example` to `.env` and replace the reserved `.example` hosts with the real root-domain and app-subdomain URLs. `VITE_MARKETING_URL` is used to generate the canonical URL, Open Graph URL, sitemap, and robots sitemap reference. `VITE_APP_URL` sends sign-in and trial links to the app subdomain. The local fallback is intentionally a reserved example domain; do not publish it as the production URL.

Terms, privacy, refund/cancellation, contact, and public status destinations are visible placeholders because the owner has not supplied legal text, support contact details, or a status service. Replace them before launch. The legal copy should come from the owner's counsel or accountant.

## Lighthouse targets

Run Lighthouse against the deployed site on mobile and desktop before launch. Targets: Performance ≥ 90, Accessibility 100, Best Practices ≥ 90, and SEO ≥ 90. No Lighthouse score is claimed for this local build; record the actual scores and tested URLs in the deployment review.
