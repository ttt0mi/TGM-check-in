# Release coverage automation

Date: 2026-10-28

This document records the automated release coverage added for the frontend remediation handoff. It distinguishes deterministic repository checks from validation that still needs a hosted provider, activated domain, assistive technology, or physical device.

## Production-code changes made for testability

- `supabase/functions/approve-privacy-notice/index.ts`
    - Exported `handleApprovePrivacyNotice` as an injectable request handler.
    - Kept the deployed `withSupabase({ auth: "user" })` wrapper and runtime behavior unchanged.
    - The handler defaults to the real `authenticatedOperator` resolver; tests inject controlled identity outcomes.
- `supabase/functions/move-staff-assignment/index.ts`
    - Exported `handleMoveStaffAssignment` using the same pattern.
    - Kept the deployed authenticated wrapper, authorization rules, preflight queries, RPC call, and response mapping unchanged.

No database migration or schema was changed.

## Fully automated coverage

### Authenticated Edge handlers

- `supabase/functions/approve-privacy-notice/index_test.ts`
    - Missing identity (`401`).
    - Inactive operator (`403`).
    - Receptionist attempting an admin action (`403`).
    - Cross-tenant organization rejection before the RPC.
    - Authenticated actor ID passed to the service-only RPC.
    - Database authorization and validation error mapping.
- `supabase/functions/move-staff-assignment/index_test.ts`
    - Missing identity, inactive operator, and non-admin rejection.
    - Inactive and cross-tenant resource rejection before mutation.
    - Successful service-only RPC arguments.
    - Active-visit, authorization, and unavailable-destination conflict mapping.

### Admin mutation timeout behavior

- `features/admin/BranchManagement.test.tsx`
    - Retains entered branch values after an uncertain timeout.
    - Restores the submit control and does not report a successful refresh.
- `features/admin/DirectoryManagement.test.tsx`
    - Retains the department value after timeout.
    - Shows the timeout as an alert and restores the mutation control.
- Existing organization approval tests remain part of the explicit release suite.

### Operator pagination beyond 100 records

- `features/admin/AccessManagement.test.tsx`
    - Loads 101 operators through five UI requests.
    - Verifies all operators are present with no missing page and the terminal cursor removes the load-more control.
- `supabase/tests/operator_directory_pagination.sql`
    - Seeds 108 organization operators.
    - Verifies maximum page size, deterministic order, three keyset pages, no overlap, tenant isolation, search, inactive operators, receptionist assignment, and invalid cursor/limit rejection.

### Analytics scale and timezone behavior

- `features/analytics/AnalyticsDashboard.test.tsx`
    - Renders a 1,003-visit aggregate.
    - Displays per-branch local-day ranges for Lagos and Los Angeles.
- `supabase/tests/reporting_aggregation_export.sql` continues to validate a 1,003-row aggregate, branch-local date boundaries, tenant/branch authorization, and export paging beyond 500 rows.

## Automated portions of hybrid validation

### Auth and CAPTCHA

- `features/auth/AuthForm.test.tsx` now verifies that the solved CAPTCHA token is forwarded for sign-in, sign-up, and recovery while preserving the existing timeout and deliberate-retry checks.
- `lib/supabase/auth-routes.test.ts` now verifies callback exchange timeouts redirect to `auth-unavailable`.
- Real Cloudflare Turnstile execution on the activated production hostname remains external.

### Invitations

- `features/auth/AcceptInvite.test.tsx` verifies account mismatch blocking and successful matching-account acceptance.
- `features/admin/AccessManagement.test.tsx` verifies visible `sent`, `failed`, and `unknown` delivery states and the confirmation guard before resending an unknown delivery.
- Existing invitation SQL regressions and fragment-to-HttpOnly-cookie browser coverage remain active.
- Actual provider delivery and inbox receipt remain external.

### Realtime and access revocation

- `features/operator/useVisits.test.tsx` verifies subscription success, refresh scheduling, fallback on channel failures, one-time failure reporting, Auth failure fallback, and channel cleanup.
- `features/operator/useAccessWatch.test.tsx` verifies that a revoked/missing session removes Realtime channels and redirects to sign-in.
- Hosted cross-session delivery and project Realtime configuration remain external.

### Email states

- The admin invitation UI tests now cover delivery-state presentation and unknown-delivery resend protection.
- Existing `supabase/functions/_shared/email-transport_test.ts` covers successful Resend submission plus HTTP/network outcomes that must remain `unknown`.
- Actual Resend acceptance, inbox placement, spam behavior, and provider logs remain external.

### CSV browser behavior

- `features/analytics/AnalyticsDashboard.test.tsx` verifies export invocation, audited export parameters, Blob creation, download initiation, and use of a validated server filename.
- Existing Deno and SQL tests cover CSV formula/row escaping, keyset export paging, and export audit completion.
- Import into the Google Sheets product remains external.

### Accessibility

- `features/admin/AdminAccessibility.test.tsx` runs Axe against core admin branch and QR controls and rejects serious or critical violations. The JSDOM-incompatible color-contrast rule is excluded.
- Existing Playwright Axe checks, focus checks, reflow checks, zoom simulation, and touch-target checks remain active.
- Screen-reader behavior, actual color rendering, real-device zoom/touch, and manual keyboard review remain external.

### QR automation added beyond the requested hybrid groups

- `features/admin/PrintableQr.test.tsx` now verifies print invocation, self-contained SVG download initiation and filename, exact link copying, and status feedback.
- Physical print quality and scanning with representative devices remain external.

## CI changes

- Added `npm run test:release-coverage` as an explicit, named release-behavior suite.
- Added the release-behavior suite to the application CI job.
- Renamed the Edge test step to make authenticated handler coverage explicit.
- Added Deno `--allow-env` to Edge tests because importing the real `@supabase/server` authenticated wrapper reads runtime environment configuration. No broader Deno permission was granted.
- Existing automatic Vitest discovery, Edge `deno check`, Edge test discovery, SQL regressions, build, and Playwright gates remain in place.

## Local verification completed

- Release behavior suite: 13 files, 33 tests passed.
- Full Vitest suite: 35 files, 98 tests passed.
- Edge Function tests: 24 passed.
- All Edge Function entrypoints passed `deno check`.
- Production and test TypeScript checks passed.
- ESLint and Prettier checks passed.
- Production Next.js build passed with 25 routes.
- Playwright: 13 browser tests passed.
- All 11 SQL rollback regression files passed, including the expanded operator pagination test.

## External validation still required

- Activated `checkin.tgmeducation.net` DNS and deployed application.
- Real Cloudflare Turnstile challenge and hostname enforcement.
- Real Auth/SMTP and Resend delivery, inbox receipt, and recovery links.
- Hosted Realtime events and access revocation across independent sessions.
- Google Sheets import.
- Screen readers, real browser/device combinations, and manual keyboard/visual review.
- Physical QR printing and scanning.
- GitHub Actions execution on the pushed branch.
