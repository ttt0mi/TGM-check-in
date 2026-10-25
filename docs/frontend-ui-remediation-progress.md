# Frontend remediation progress

The [master handoff](frontend-ui-remediation-handoff.md) remains the source of truth for scope, invariants, and acceptance. This file records implementation and release evidence.

## Baseline, 25 October 2026

- Local branch: `codex/frontend-ui-remediation`; pre-remediation checkout saved as local commit `038d0aa` and as a patch/archive under `/private/tmp/tgm-ui-baseline.F5UzP2`. Nothing has been pushed.
- The user confirmed `btnfwljsnizhasxotatx` is currently shared by staging and production. The frontend URL is `https://reception.tgmeducation.net`; Cloudflare Pages and Workers are the current hosting choice. There is no isolated backend staging project or confirmed staging frontend URL.
- Staging has migrations through `20261022090113`. Local checkout and local database also have invitation migrations `20261023055347` and `20261023055448`; these have not been applied to staging. New migration `20261025091610` is local only.
- On 25 October, `supabase config diff` found that staging lacks the new `/auth/recover` redirect URLs and differs on the recovery email subject. CAPTCHA and password requirements did not appear in the diff; masked credential values and template content were not verified. The remote-only storage image transformation setting must be preserved when changing Auth configuration.
- Baseline `npm run typecheck` passed. The first remediation slice passes format, lint, both typechecks, unit tests, production build, six Playwright scenarios, Deno checks for its two new functions, and the invitation SQL regression against a local rollback transaction.

## Release gates

- Do not enable the new Auth recovery flow in staging until its Auth redirect allowlist, recovery email template, and `TGM_RECOVERY_INTENT_SECRET` are configured and verified there.
- Apply and validate the two pending invitation migrations before deploying the invitation preview migration and Edge Function.
- Reconcile generated database types against the intended deployed schema using the official CLI. The current CI hosted-type comparison targets a repository variable whose project value still needs confirmation.
- No staging or production deployment, remote Git push, or live legacy-object deletion has occurred.
- Because staging and production share one Supabase project, a hosted migration or Edge deployment would affect the live backend. Do not treat a deployment to this project as an isolated staging gate. Obtain a separate staging backend or an explicit revised release approach before hosted rollout.

## Local route cutover

- `/` now redirects to `/start`; disabled routes explain unavailability. The public QR route distinguishes malformed/inactive codes from a directory service outage.
- The seven legacy frontend/API files and unused Next.js `resend` dependency were removed after a reference search, replacement production build and six passing Playwright scenarios. A clean production build after deletion exposes none of the four retired API paths; both typechecks, unit tests, lint and format also pass.
- Next.js route loading and error boundaries, a route/flag inventory, a safe HTTP error classifier, and a skip link are in place. The full typed Edge/PostgREST rollout and remaining recovery states are still part of the handoff acceptance contract.

## Local public check-in slice

- New additive privacy migration stores admin-approved notice copy, policy URL, approver, and approval time. The public directory and submission Edge functions reject organizations without approved content; no organization notice has been supplied or invented. The user confirmed no approved copy exists yet.
- Directory metadata loads departments first and fetches active host display names only for the selected department. The form refreshes directory state on focus and every two minutes.
- Shared tablets can explicitly clear the branch-scoped token and start another visitor. Blocked session storage keeps the current visit in memory and explains the refresh limitation. Nigeria local mobile numbers are normalized to E.164; field errors, CAPTCHA recovery, and status freshness/retry are more explicit.
- Local migration applied; rollback-only SQL authorization test passed. Official database types were regenerated from the local migrated schema. Format, lint, both typechecks, 15 unit tests, production build, Deno checks of changed Edge functions, and seven Playwright scenarios passed. Hosted-type comparison remains blocked until schema deployment to an isolated or explicitly approved target.

## Local host-decision and email slice

- A read-only, token-hash preview RPC and rate-limited Edge operation return visitor decision context or separate invalid, expired, and used states. The token remains in tab-scoped storage across refresh, is removed from the address bar, and is consumed only after explicit approval or decline confirmation.
- Host and invitation Edge workflows now use a pinned Resend SDK through one transport. They retain distinct business logic, idempotency keys, HTML and text content, and `sent`/`failed`/`unknown` delivery accounting. A provider HTTP error or network ambiguity remains `unknown`; a test covers the SDK result mapping. The root Next.js `resend` package remains absent because no Next.js route sends email.
- The host preview migration and its rollback-only SQL scenario have passed locally. All migrations replayed successfully in a fresh local reset; database lint and the full local SQL regression suite passed. Format, lint, both TypeScript checks, 15 unit tests, the production build, all Edge checks, nine Deno tests, and seven Playwright scenarios passed. Hosted deployment and hosted type generation remain gated by the shared staging/production Supabase project.

## Local reception queue slice

- Active visits now load in four status groups independently of completed history. Each group has an exact count, server-side name/phone search, an oldest-first `(arrived_at, id)` cursor, and a visible path to load every remaining page. Terminal history has its own newest-first cursor and can be opened separately.
- Per-branch review, host, and admission overdue thresholds default to 15, 30, and 10 minutes and are editable in branch administration. On-site visits have no overdue label. The additive migration adds matching partial indexes and invoker-security RPCs under existing visit RLS; `public` is in the local Data API schema exposure list.
- Realtime connection state, reconnect refresh, burst coalescing, manual refresh, and 30-second polling fallback are visible. Access-watch now keeps the screen during transient fetch failures and retries with backoff, while confirmed revocation disconnects channels and redirects.
- The rollback-only SQL test passed with 101 recent terminal visits and an older active visit, including authenticated RLS reads and deterministic history pages. The new migration replayed in a local reset; official types were regenerated. Both TypeScript checks, lint, 15 unit tests, and a production build passed. No hosted schema or frontend was changed.

## Local visit integrity and administration slice

- Five additive migrations link successive staff assignments to an immutable person, block moves and deactivation while active visits depend on the assignment, preserve host display names in visit history, audit edited visit field names and actor, and add paginated invitation history with inviter and last delivery attempt. Existing migrations and legacy database objects remain intact. Official database types were regenerated with the Supabase CLI.
- The assisted form keeps its original branch through directory refresh and requires a submit or discard confirmation. Visit actions refresh visit and event caches; history retains loaded records and offers retry. Operator directory choices refresh on mount and focus.
- Management now has deep links, searchable paginated staff and invitation lists, dependency preflights with active visit details, linked staff moves, and explicit pending and error states. Branch, department, staff, operator, and invitation changes have contextual confirmations. Resend remains the active email SDK.
- A fresh local database reset replayed all migrations through `20261025102856`. Four focused SQL regressions passed: staff assignment integrity, visit edit audit, invitation delivery/history, and visit lifecycle. The frontend typecheck and production build and the changed Edge Function's Deno check passed. Routine format and lint passes were skipped at the user's request. No remote Git push or hosted deployment occurred.
