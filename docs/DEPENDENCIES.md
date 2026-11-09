# Dependency pins and verification

All direct dependencies are exact versions. Installs use `npm ci` against the committed lockfiles. The minimum runtime is Node.js `>=22.22.2`; `.nvmrc` pins local development to `22.22.2`.

## Registry verification (Step 0)

On 2026-11-05, every exact package/version named by specification sections 18.4, 18.5, and 18.7 was checked with `npm view <name>@<version> version peerDependencies engines --json`. All 66 entries existed. Peer ranges and engine requirements were read; the minimum supported Node version is 22.22.2, set by `jsdom@30.1.3`. Step 0 also selected and checked these exact pins:

| Package                 |  Version | Use                                                                        | Verified registry metadata                           |
| ----------------------- | -------: | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `razorpay`              |  `2.9.8` | Backend subscription client                                                | `npm view razorpay@2.9.8 ...` returned `2.9.8`       |
| `cloudinary`            | `2.11.0` | Backend private file storage                                               | Node `>=9`                                           |
| `migrate-mongo`         | `14.0.7` | Backend migration tooling                                                  | Node `>=20`; peer MongoDB `^4.4.1`, `^5`, `^6`, `^7` |
| `@fontsource/noto-sans` |  `5.3.0` | Bundled OFL Latin and Devanagari font subsets for PDF text and rupee glyph | `OFL-1.1`                                            |

Noto Sans was added after reading the PDF requirement: the font file and OFL license are bundled in `backend/assets/fonts/`. It was also checked with `npm view @fontsource/noto-sans@5.3.0 version license engines --json`.

## Direct dependency versions

The authoritative complete package/version lists are the `dependencies` and `devDependencies` objects in each app manifest. Every version is exact; neither manifest contains a range. Lockfiles contain the complete transitive graph.

Backend runtime: `express@5.3.0 mongoose@9.11.4 zod@4.6.7 jsonwebtoken@9.0.3 bcrypt@6.0.0 helmet@8.3.0 cors@2.8.6 cookie-parser@1.4.7 express-rate-limit@8.7.2 morgan@1.12.1 pino@10.4.0 nodemailer@10.3.1 multer@2.5.0 node-cron@4.6.0 pdfkit@0.20.2 csv-stringify@6.9.0 razorpay@2.9.8 cloudinary@2.11.0 @fontsource/noto-sans@5.3.0`.

Backend development: `vitest@5.0.5 @vitest/coverage-v8@5.0.5 supertest@7.3.1 mongodb-memory-server@11.3.0 eslint@10.13.0 @eslint/js@10.0.1 globals@17.13.0 eslint-config-prettier@10.1.8 prettier@3.9.10 pino-pretty@13.2.0 migrate-mongo@14.0.7`.

Frontend runtime: `react@19.3.1 react-dom@19.3.1 react-is@19.3.1 react-router-dom@7.18.5 axios@1.21.0 @tanstack/react-query@5.105.0 zustand@5.0.16 react-hook-form@7.91.0 @hookform/resolvers@6.0.2 zod@4.6.7 recharts@3.10.1 lucide-react@1.64.0 motion@14.8.0 sonner@2.0.8 date-fns@4.4.0 @date-fns/tz@1.5.0 clsx@2.1.1 tailwind-merge@3.7.0 @radix-ui/react-dialog@1.3.1 @radix-ui/react-alert-dialog@1.2.1 @radix-ui/react-dropdown-menu@2.2.1 @radix-ui/react-tooltip@1.4.1 @radix-ui/react-select@2.4.1 @radix-ui/react-tabs@1.2.1 @radix-ui/react-popover@1.3.1`.

Frontend development: `vite@8.3.5 @vitejs/plugin-react@6.1.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 vitest@5.0.5 jsdom@30.1.3 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.8 msw@3.0.3 @playwright/test@1.64.1 @axe-core/playwright@4.14.0 eslint@10.13.0 @eslint/js@10.0.1 globals@17.13.0 eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.7 eslint-config-prettier@10.1.8 prettier@3.9.10`.

Phase 13 OCR-only pins (`tesseract.js@7.0.0`, `pdf-parse@2.4.5`) were included in the registry check but are not installed in Phase 1.

## Install and audit notes

## Hosted services, costs, and open-source status

- Sentry initialization, DSN settings, and SDK dependencies were removed. No errors are sent to Sentry.
- Razorpay is a hosted payment processor and may charge transaction fees. Its SDK remains in the Phase 1 dependency list to match the approved architecture, but Phase 1 has no Razorpay integration; the example keys are blank. Any later activation needs a separate provider and fee decision.
- Cloudinary is a hosted file-storage service with plan limits and possible charges. Its SDK remains to match the approved storage-provider architecture, but Phase 1 does not call it; its example credentials are blank. Local development currently needs no Cloudinary account. Production storage must be selected before that feature is built.
- MongoDB Community Server can be self-hosted without a service fee; managed database hosts may charge. The backend example URI points to a local MongoDB instance.
- Authentication email can use Nodemailer over SMTP or Resend over its HTTPS API. The Resend adapter uses Node's built-in `fetch`, so it adds no package dependency. Resend is a hosted service, not open source; its current free plan lists 3,000 emails/month and 100/day, with limits and plan terms subject to change. Never commit `RESEND_API_KEY`.
- Password safety checks call the free Have I Been Pwned range API using k-anonymity: only five leading SHA-1 hash characters leave the backend, not the password or full hash. The check fails closed if the API is unavailable. This is an external free endpoint, not a dependency or hosted application account.
- Hosting, domain names, and production backups can incur charges depending on the provider. Phase 1 does not configure or purchase any hosted infrastructure.
- The application dependencies are open-source packages. This does not make external services those packages can connect to free or open source.

- `.npmrc` sets `save-exact=true`, `engine-strict=true`, and `package-lock=true`.
- The environment's npm 10.9.7 crashed in Arborist while resolving the declared Vitest peer graph (`Cannot read properties of null (reading 'edgesOut')`). The same exact dependencies installed with temporary npm 11.21.2 (registry `engines: ^20.17.0 || >=22.9.0`). This is an installer-only workaround; npm is not an application dependency.
- `npm audit` on 2026-11-05 reports 4 moderate advisories in each app, all in the pinned ESLint 10 dependency graph. The affected paths include `eslint`, `@eslint/js`, `@eslint/config-array`, and `minimatch`; npm reports the available remediation as an ESLint 9 major change. No automatic upgrade was applied because the approved spec pins ESLint 10. Review a future dependency change explicitly. One advisory is [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) for minimatch globparts amplification.
- On Windows, the bundled `mongodb-memory-server` binary requires the Microsoft Visual C++ x64 runtime DLLs. The owner installed the runtime during Phase 1, after which the complete backend suite passed locally, including the replica-set transaction tests. A fresh Windows setup may need the [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170). CI is configured to run this smoke test on Ubuntu; hosted CI has not yet been triggered from this workspace.
- `npm run verify-pins` validates direct pins against the manifests and this document. `npm ci` must not change either lockfile.
