# Phase 3: App shell

## Completed

- Built a responsive application layout with the specified `AppLayout`, `Sidebar`, `Header`, `MobileNavigation`, and `PageContainer` components. The mobile menu is animated and respects reduced-motion preferences. There is no business switcher.
- Added light/dark theme tokens and a persisted theme toggle.
- Wrapped Radix Dialog, Dropdown Menu, Tooltip, Tabs, Select, and Popover primitives in `components/ui`; added reusable Button, Input, Badge, Skeleton, EmptyState, DataTable, Pagination, native DatePicker, and `MoneyInput` using `parseMajorToMinor`.
- Added accessible loading skeletons, empty states, keyboard focus styling, skip navigation, and the provisional calculation policy notice.
- Added trial and read-only banners that render from supplied server state. Creation actions are suppressed in read-only mode.
- Optional Expenses, Reports, Reminders, and Team navigation appears only when enabled by the supplied entitlement snapshot. The browser does not infer entitlements from a plan.
- Documented frontend setup and shell integration in `frontend/README.md`.

## Acceptance checks

- Frontend unit suite: 18 tests passed.
- Frontend lint, formatting, dependency-pin verification, and forbidden-claims scan passed.
- Every pinned frontend package version was checked with `npm view`; no package versions were changed.
- Production build and financial parity build passed.
- Playwright Chromium suite: 3 tests passed, including overflow/navigation checks at 360, 768, 1280, and 1920 px; zero axe violations on dashboard and tax settings in light theme and tax settings in dark theme; and shared BigInt parity fixtures.

## Scope notes

- Billing entitlements remain server-authoritative; backend billing and entitlement services are scheduled for Phase 9A. The shell accepts that future API snapshot but does not fabricate one.
- Authentication/customer/invoice workflows and functional dashboard data are later phases. The dashboard's zero totals and workspace empty states are placeholders, not live business data.
- No paid service or external monitoring integration was added.

Phase 3 is complete. Phase 4 has not started and requires the owner's approval.
