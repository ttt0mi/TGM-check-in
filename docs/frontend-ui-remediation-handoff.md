# TGM frontend and UI remediation master handoff

Status: implementation brief based on the current checkout on 25 October 2026.

This document is the source of truth for an implementation agent fixing the current Next.js frontend and its supporting Supabase contracts. It intentionally contains more context than an ordinary issue list. Do not implement isolated cosmetic fixes without understanding the end-to-end behavior and invariants described here.

## 1. Mission

Improve the current Next.js frontend into a dependable, understandable and accessible visitor-management experience across visitor phones, shared reception tablets, host email links, operator desktops and admin screens.

The implementation must:

1. Fix the functional and user-experience findings in this document in priority order.
2. Preserve the existing security and data-integrity properties called out under “Architecture to preserve.”
3. Remove all legacy application code and legacy rollout fallbacks after proving that the new flows cover the active routes.
4. Keep the repository buildable and independently deployable throughout the work; split implementation into reviewable phases rather than attempting one unreviewable change.
5. Leave no important behavior implicit. UI copy, state transitions, recovery paths and operational limitations must be visible and testable.

## 2. Scope and exclusions

In scope:

- Next.js 16 App Router frontend.
- Supabase browser/server clients, Auth integration, RLS-facing queries, RPC contracts and Edge Functions used by the frontend.
- Authentication and onboarding.
- Public visitor check-in and visitor status.
- Host email and host decision handling.
- Operator dashboard and assisted check-in.
- Organization, branch, directory and operator access administration.
- Analytics, Recharts, CSV export and printable QR codes.
- Error handling, loading states, state freshness, accessibility, responsive behavior, performance and operational clarity.
- Removal of the old frontend/API implementation and its now-unused dependencies.

Do not implement geofencing, face matching, photo capture/retention, self-checkout or daily digests as part of this work. When deleting the old implementation, remove obsolete code for those areas rather than building replacements. Do not use an excluded feature as a reason to retain the old application shell.

Existing automated test internals are not explained here. The implementing agent must nevertheless add or update tests for changed behavior and run the repository validation commands listed at the end.

## 3. Non-negotiable engineering rules

- Do not edit an existing Supabase migration. Create a new migration with the current Supabase CLI when a schema or database-function change is required.
- Do not delete historical migration files when removing legacy code. Migration history must remain reproducible.
- Regenerate database types only with the official Supabase CLI against the intended schema. Remove `as never` workarounds after regeneration where possible.
- Do not expose `SUPABASE_SECRET_KEY`, a service-role key, `RESEND_API_KEY`, CAPTCHA secrets or other server credentials to the browser.
- UI feature flags are rollout controls, not authorization. Continue enforcing authorization in RLS, protected RPCs and Edge Functions.
- Do not weaken RLS or change a function to `SECURITY DEFINER` merely to solve a permission error. Any security-definer function must have a pinned empty `search_path`, schema-qualified objects, explicit authorization and narrowed execute grants.
- Treat expected errors as structured product states. Do not turn expected conflicts, access denials or inactive resources into generic exceptions or 404 pages.
- Destructive and irreversible operations require clear impact copy and confirmation proportional to their consequences.
- Preserve server-generated timestamps and branch timezone rules. Do not calculate authoritative visit lifecycle times from the browser clock.
- Do not silently check out or close a visit because a browser closes, a page unloads or a device changes location.
- Do not log bearer tokens, CAPTCHA tokens, passwords, visitor PII or email bodies.
- Before deleting any legacy target, prove it is unreferenced with repository search, a production build and relevant tests. Remove callers and documentation in the same change.

## 4. Current technology baseline

The current package manifest uses:

- Next.js `^16.4.2` with React `^19.1.0`.
- Supabase JS `^2.117.3`, Supabase SSR `^0.12.7` and `@supabase/server` `^1.9.2`.
- TanStack Query `^5.104.5`.
- React Hook Form `^7.90.0`, `@hookform/resolvers` and Zod `^3.25.76`.
- Recharts `^3.10.1`.
- `qrcode.react` `^4.2.0`.
- Turnstile, Vitest, Playwright and axe tooling.

Check the current package versions and official documentation again immediately before implementation. Do not assume this snapshot remains current.

## 5. Architecture to preserve

The following are deliberate strengths and must not be lost during cleanup:

- App Router server pages authenticate and load initial authorized data.
- RLS provides tenant boundaries instead of relying only on client checks.
- Sensitive Edge Functions repeat authorization checks.
- The database enforces visit state transitions and branch access.
- Public and assisted submissions use idempotency keys.
- Visitor, invitation and host bearer tokens are stored hashed.
- Invitation cookies are HTTP-only and `SameSite=Strict`.
- Host and invitation links carry raw tokens in URL fragments, which are not sent to the server with the initial page request.
- Realtime channels are private and branch-scoped.
- Broadcasts contain invalidation signals; the client refetches authoritative database state rather than trusting mutable visit data in the broadcast payload.
- Visit events, checkout method, actor and correction provenance provide an accountability foundation.
- Branch deactivation is blocked by the database while active visits exist.
- Terminal visitor status remains readable for the visitor-session lifetime.
- Branch timezones drive clocks and report calendar-day calculations.
- CSV export is admin-only and already contains formula-injection mitigation.
- Host email review is saved before delivery is attempted; an email outage does not erase reception review.
- Ambiguous email-provider outcomes are not automatically retried.

## 6. Current active route and file map

### Next.js pages

| Route                                                                       | Primary files                                                                 | Responsibility                                                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                         | `app/page.tsx`                                                                | Currently chooses the new start flow only when flags align; otherwise renders the old home. Must stop rendering legacy UI.             |
| `/start`                                                                    | `app/start/page.tsx`                                                          | Directs an authenticated account according to profile, role, organization and invitation state.                                        |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | `app/*/page.tsx`, `features/auth/AuthForm.tsx`                                | Supabase Auth browser flows.                                                                                                           |
| `/auth/callback`                                                            | `app/auth/callback/route.ts`                                                  | Exchanges Auth callback state and redirects.                                                                                           |
| `/invite`, `/invite/accept`                                                 | `features/auth/InviteCapture.tsx`, `AcceptInvite.tsx`, `app/api/invitation/*` | Preserves a fragment token in an HTTP-only cookie and accepts an invitation.                                                           |
| `/organizations/new`                                                        | `features/auth/CreateOrganization.tsx`                                        | Creates the first organization/admin through an Edge Function.                                                                         |
| `/check-in/[token]`                                                         | `features/public-check-in/*`                                                  | Public directory, visitor submission and visit-status polling. Currently falls back to a legacy component when the public flag is off. |
| `/host-decision`                                                            | `features/host-decision/HostDecision.tsx`                                     | Reads the host token and submits approval/decline. It does not send email.                                                             |
| `/app`                                                                      | `features/operator/*`                                                         | Branch queue, assisted submission, visit actions/history and Realtime invalidation.                                                    |
| `/app/manage`                                                               | `features/admin/*`                                                            | Organization, branches, directory and operator access.                                                                                 |
| `/app/analytics`                                                            | `features/analytics/*`                                                        | Report filters, Recharts and CSV export.                                                                                               |
| `/app/branches/[id]/qr`                                                     | `features/admin/PrintableQr.tsx`                                              | Printable branch check-in QR.                                                                                                          |

### Active Supabase Edge Functions

| Function                                                                                                           | Called by           | Responsibility                                            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------- |
| `get-public-directory`                                                                                             | public route/server | Returns safe active branch directory data.                |
| `submit-public-visit`                                                                                              | public browser API  | Validates CAPTCHA and creates/replays a public visit.     |
| `get-visitor-visit`                                                                                                | visitor status      | Returns token-scoped visit status.                        |
| `create-assisted-visit`                                                                                            | operator dashboard  | Creates an operator-assisted visit.                       |
| `reception-visit-action`                                                                                           | operator dashboard  | Executes allowed visit transitions and edits.             |
| `send-host-email`                                                                                                  | operator dashboard  | Creates a host-decision token and sends the host email.   |
| `respond-to-host-visit`                                                                                            | host decision page  | Consumes the decision token and records approval/decline. |
| `register-organization`                                                                                            | onboarding          | Creates an organization and initial admin.                |
| `create-branch`                                                                                                    | admin               | Creates a branch using protected server-side rules.       |
| `invite-operator`, `operator-directory`, `manage-operator`, `manage-operator-invitation`, `accept-operator-invite` | admin/invitation UI | Operator access lifecycle.                                |
| `get-visit-analytics`, `export-visit-report`                                                                       | analytics           | Report aggregation and CSV creation.                      |

## 7. Host email and decision architecture

### 7.1 Correct call graph

There is one active host-decision email generator. `HostDecision.tsx` does not generate an email.

```text
Receptionist selects review/notify
  -> features/operator/VisitActions.tsx
  -> invokes send-host-email
  -> send-host-email authorizes the operator
  -> tgm_mark_stale_host_email / tgm_prepare_host_email
  -> create random token; store token hash
  -> build /host-decision#token=...
  -> build email HTML and send through Resend
  -> tgm_finish_host_email records sent/failed/unknown

Host opens the email link
  -> Next.js renders /host-decision
  -> HostDecision.tsx reads the fragment after hydration
  -> HostDecision.tsx removes the fragment from the address bar
  -> host chooses approve or decline
  -> features/public-check-in/api.ts invokes respond-to-host-visit
  -> respond-to-host-visit hashes the supplied token
  -> tgm_respond_to_host consumes it and transitions the visit
```

`supabase/functions/_shared/invitation-email.ts` sends a different email: an operator invitation linking to `/invite`. `send-host-email` imports only `appOrigin()` from that file. `_shared` modules do not execute by themselves.

An older `app/api/visitors/[id]/approve/route.ts` also sends mail through the Resend Node SDK, but the new operator frontend does not call it. It belongs to the legacy application and must be removed with that application.

### 7.2 Preserve these host-email properties

- Email provider credentials remain server-side.
- The operator must be authenticated and authorized for the branch.
- Raw decision tokens are never stored in the database.
- The email uses a fragment token, not a query parameter.
- The token is single-use and expires.
- Provider calls use idempotency keys.
- `sent`, `failed` and ambiguous `unknown` outcomes remain distinct.
- An ambiguous provider outcome must not automatically create a new token/email because the original message may have been accepted.
- Reception still performs final admission after host approval.

### 7.3 Required host-email cleanup

1. Move generic `appOrigin()` validation out of `invitation-email.ts` into a neutral module such as `_shared/app-origin.ts`.
2. Consolidate the duplicated `htmlEscape()` utility into a neutral tested module.
3. If useful, extract low-level Resend transport/configuration into `_shared/email-transport.ts`, while retaining separate host and operator-invitation business workflows.
4. Move `respondToHostVisit()` from `features/public-check-in/api.ts` to `features/host-decision/api.ts` so ownership matches the feature.
5. Do not move provider delivery into React or a public Next.js component.
6. Add a plain-text alternative to transactional emails if supported by the chosen template/transport implementation.
7. Keep `docs/host-email-recovery.md` accurate; link it from the admin delivery-state UI.

### 7.4 Required host-decision preview

The email includes visitor details, but the linked page does not. Add a non-consuming, token-scoped preview operation, preferably a dedicated `get-host-decision-preview` Edge Function rather than overloading the mutating endpoint.

Preview requirements:

- Accept the raw token over POST, never in a server-visible URL query string.
- Validate token format, hash it server-side and look up an unused, unexpired token.
- Return only the context required for a safe decision: visitor display name, organization if provided, visit type, purpose, branch name, branch-local arrival time and expiry.
- Do not expose internal operator data, database identifiers or unrelated visitor information.
- Do not consume the token or mutate the visit.
- Return explicit invalid, expired and already-used states without exposing whether arbitrary visits exist.
- Rate-limit abuse and avoid logging the token/body.
- `HostDecision.tsx` must show a loading state while fetching the preview, a retryable network-error state, and a terminal invalid/expired/used state.
- Ask for confirmation before either irreversible outcome, with especially clear decline copy.
- Only `respond-to-host-visit` consumes the token.

### 7.5 Host token continuity

The component removes the fragment immediately and then holds the token only in React state. A refresh loses it. Persist the validated token in tab-scoped session storage before removing the fragment, with these rules:

- Use a dedicated key and clear it after success, confirmed invalidity/expiry or explicit cancellation.
- Never use local storage or a normal cookie for the raw token.
- Never send it to the Next.js server during initial rendering.
- If session storage is unavailable, keep the in-memory flow working and tell the user not to refresh.
- Opening the page must not consume the token; email security scanners must not approve or decline visits.

## 8. Priority zero: release-blocking fixes

### P0-01 — Auth CAPTCHA is configured but missing from Auth UI

Evidence:

- `supabase/config.toml` has `[auth.captcha] enabled = true`, provider `turnstile`.
- `features/auth/AuthForm.tsx` does not render a CAPTCHA or pass `options.captchaToken` to sign-up, sign-in or password-reset requests.

Required implementation:

- Render Turnstile on every Supabase Auth form protected by the project configuration.
- Use the configured public site key.
- Disable submission until a valid token exists.
- Pass `captchaToken` through the correct Supabase Auth options for each operation.
- Reset the widget/token after every attempt and on expiry/error.
- Provide accessible loading, expiry and provider-error messages.
- Confirm local and hosted Auth settings before release; repository config is not proof of hosted configuration.

Acceptance:

- Sign-up, sign-in and reset requests succeed with valid CAPTCHA and fail clearly without/with expired CAPTCHA.
- No secret key reaches the browser.
- Keyboard and screen-reader flows work.

Reference: [Supabase Auth CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

### P0-02 — Shared tablets are locked to one visitor session

Evidence:

- `features/public-check-in/PublicCheckIn.tsx` replaces the form with `VisitStatus` whenever a branch session token exists.
- The latest visitor-session migration deliberately keeps terminal status readable for the token lifetime.
- There is no “check in another visitor” action.

Required implementation:

- Add an explicit terminal-state action: “Finish and check in another visitor.”
- Clear only the current branch’s tab session after confirmation, then return focus to the form heading.
- Do not clear pending/on-site sessions without warning; shared-tablet reset for an active visit must explain that the visitor can no longer follow that visit in this tab.
- Consider an explicit shared-device mode if the same URL is deployed on fixed kiosks. Do not infer shared mode from screen size.
- Continue allowing a personal-device visitor to view their terminal result for the full token lifetime until they choose to finish.

Acceptance:

- Two visitors can check in sequentially from one tablet/tab.
- A terminal result remains visible until acknowledged.
- Clearing one branch session does not remove another branch’s tab state.

### P0-03 — The newest-100 query can hide active visits

Evidence:

- `app/app/page.tsx` and `features/operator/useVisits.ts` order by arrival descending and apply `.limit(100)` across all statuses.

Required implementation:

- Create a dedicated operational query for unresolved and on-site statuses with deterministic ordering and no competition from terminal history.
- Load terminal history separately with cursor-based pagination.
- Add state groups/counts: reception review, waiting for host, approved awaiting admission and currently on site.
- Add search/filtering without hiding urgent items by default.
- Define and display overdue thresholds rather than leaving an older waiting visitor indistinguishable.
- Recheck indexes/query plans; add a new migration for indexes if required.

Acceptance:

- More than 100 recent completed visits cannot hide any active visit.
- Pagination is stable when new visits arrive.
- Branch access remains enforced in RLS/RPCs.

### P0-04 — Host decisions lack context and refresh continuity

Implement the preview and token-continuity design in section 7. The page must not send an email. It must render the request created by `send-host-email` and submit only the explicit decision.

### P0-05 — Missing route-level error, not-found and loading experiences

Evidence: there are no application-defined `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` files in the active App Router tree.

Required implementation:

- Add a branded root `not-found.tsx` for genuinely missing resources/routes.
- Add root `error.tsx` and `global-error.tsx` with retry, safe navigation and non-sensitive support reference.
- Add nested error boundaries for operator/admin/analytics areas where recovery can preserve the rest of the shell.
- Add `loading.tsx` or deliberate Suspense fallbacks for dynamic routes.
- Do not use `notFound()` for service outages, expected permission states or inactive organizations.
- Log unexpected errors through an approved monitoring path without PII/tokens.

References: [Next.js error handling](https://nextjs.org/docs/app/getting-started/error-handling) and [Next.js loading/streaming](https://nextjs.org/docs/app/getting-started/linking-and-navigating).

### P0-06 — Edge Function response details are discarded

Evidence: most `supabase.functions.invoke()` callers display only `error.message`; `FunctionsHttpError.context` is not parsed.

Required implementation:

- Create one typed client helper that distinguishes `FunctionsHttpError`, `FunctionsRelayError` and `FunctionsFetchError`.
- Parse the JSON body for an HTTP function error and map safe error codes/messages to product copy.
- Preserve status/category for callers that need conflict, forbidden, invalid-input or unavailable behavior.
- Provide a safe generic fallback; never expose raw stack traces or sensitive SQL details.
- Apply it to organization/branch creation, invitations, operator actions, assisted visits, visit actions, email, analytics and export.

Reference: [Supabase JS error handling](https://supabase.com/docs/guides/api/handling-errors-in-supabase-js) and [Edge Function error handling](https://supabase.com/docs/guides/functions/error-handling).

### P0-07 — Invitation acceptance loses retry state

Evidence: `app/api/invitation/accept/route.ts` deletes the invitation cookie after a returned function response, including nonterminal function errors.

Required implementation:

- Delete the cookie only after success or a confirmed terminal state: invalid token, expiry, revocation, already accepted in the intended account, or equivalent explicit outcome.
- Retain it for network errors, relay failures, 5xx responses and retryable conflicts.
- Show organization, invited email, role, branch and expiry before acceptance.
- Explain account/email mismatch and the recovery action.

### P0-08 — Feature flags and route navigation disagree

Evidence:

- Dashboard navigation always exposes Manage and Analytics links.
- The QR route does not enforce the admin frontend flag despite README ownership.
- Root and check-in routes use old UI as a feature-flag fallback.

Required implementation:

- Remove legacy fallback rendering.
- Define one dependency matrix for route availability and navigation visibility.
- Hide or mark unavailable destinations consistently.
- Gate QR administration with the same admin availability rule as management.
- Make `/` deterministically redirect into the new start/onboarding flow.
- Keep backend authorization independent of flags.

## 9. Priority one: core workflow and integrity fixes

### P1-01 — Password requirements do not match the UI

The frontend says only “at least eight characters,” while local Supabase config requires lowercase, uppercase, digits and symbols. Show the exact rules, provide a live checklist, use the same schema for signup/reset and display the server’s `WeakPasswordError` safely. Confirm hosted settings. Reference: [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

### P1-02 — Recovery-session intent is unclear

The reset page checks for an authenticated user but does not clearly prove/communicate that the session came from password recovery. Review the intended security model, recovery callback handling and `secure_password_change`. If the route also supports ordinary password changes, separate the two experiences and require current-password/reauthentication where appropriate. Reference: [Supabase password Auth](https://supabase.com/docs/guides/auth/passwords).

### P1-03 — Auth callback errors are invisible

Read safe callback error codes on the login page, show a helpful message and remove/replace the error parameter after display where appropriate. Do not echo arbitrary query-string content.

### P1-04 — Verify-email page is a dead end

Add resend, change-address/sign-out, “I have verified” continuation, spam-folder guidance, cooldown feedback and consistent styling. Avoid user enumeration.

### P1-05 — Suspended users are trapped

Add organization-state explanation, sign out/switch account, contact-admin/support and retry access check. Do not show management/analytics links.

### P1-06 — Inactive organization handling is inconsistent

`app/app/manage/page.tsx` can throw on RLS-hidden organization data before reaching its suspended redirect. Resolve organization/profile state before broad parallel queries, distinguish inactive from missing/forbidden, and use the same suspended experience throughout operator/admin/analytics pages.

### P1-07 — Valid QR outages look like missing branches

`app/check-in/[token]/page.tsx` must reserve `notFound()` for genuinely invalid/inactive slugs. Network, configuration and Supabase failures require a retryable “check-in temporarily unavailable” page with support/reception guidance.

### P1-08 — Operator Realtime failures are silent

Use the `subscribe((status, error) => ...)` callback, display connection state, log safe diagnostics, refresh on reconnection and provide polling/manual-refresh fallback. Debounce multiple broadcast invalidations. Reference: [Supabase Realtime client error handling](https://supabase.com/docs/guides/api/handling-errors-in-supabase-js) and [Realtime protocol](https://supabase.com/docs/guides/realtime/protocol).

### P1-09 — Access-watch network failures masquerade as revocation

Change `useAccessWatch` to distinguish confirmed forbidden/inactive state from fetch/network failure. Confirmed revocation should disconnect Realtime and redirect. A transient failure should show degraded connectivity, retry with backoff and retain the current screen without authorizing new protected mutations beyond what the backend independently permits.

### P1-10 — Realtime revocation is eventually consistent

Document and account for cached private-channel authorization. Refresh channel auth when sessions refresh, disconnect promptly after confirmed revocation and keep sensitive data out of broadcast payloads. Do not claim immediate revocation solely from channel policy. Reference: [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) and [`setAuth`](https://supabase.com/docs/reference/javascript/setauth).

### P1-11 — Visit edits are not audited

`tgm_operator_visit_action` returns immediately after its edit update, before inserting a visit event. Add a new migration that records who edited the visit, when and which fields changed. Avoid placing sensitive old/new values in broadly visible metadata unless explicitly required; field names plus appropriate safe values may be sufficient. Invalidate visit history after save.

### P1-12 — History cache remains stale after actions

Invalidate or update both `['visits', locationId]` and `['visit-events', visitId]` after actions that append events. Realtime invalidation should also refresh an expanded affected history or use a targeted event notification.

### P1-13 — Assisted form can silently change branches

Reset or confirm when the selected dashboard branch changes. Display the target branch in the form and include it in the submit confirmation. Never submit retained Branch A data to Branch B without explicit operator acknowledgement.

### P1-14 — Staff and department changes do not refresh dashboard choices

Add an authoritative refresh strategy for branch/directory metadata. At minimum refresh on window focus and after returning from management; preferably invalidate shared query keys after admin mutations. Do not rely permanently on server props.

### P1-15 — Deactivated hosts lose historical identity

Historical visit rendering must not depend on the host being active. Load referenced inactive staff safely for display or snapshot the host display name at visit creation through a new migration/business rule. Do not expose inactive hosts in new check-in selection.

### P1-16 — Deactivating a host can strand pending notification

Before staff deactivation, query/display active visits that reference that host, including waiting-for-email/decision states. Block deactivation or require a guided reassignment/cancellation. Preserve host decision consistency if an already-sent token remains valid.

### P1-17 — Branch deactivation protection is opaque

Keep the database trigger that blocks deactivation with active visits. Add a preflight count and human-readable blocker in the UI, plus links/filtering to the affected queue. Translate the database exception if a race occurs.

### P1-18 — Department deactivation can hide active staff

Prevent deactivation while active staff remain, or provide a guided move/deactivate workflow. Do not leave active staff assigned to a department omitted from operator selection.

### P1-19 — Moving staff conflicts with historical composite references

Choose and encode a clear rule. Recommended: treat a staff branch/department assignment referenced by visit history as immutable; moving a person deactivates the old assignment and creates a new one linked by a stable person identifier if needed. Do not present a normal editor that ends in an unexplained foreign-key error.

### P1-20 — Destructive actions lack confirmation

Add contextual confirmation for visit cancellation, checkout where appropriate, host decline, branch/department/staff/operator deactivation and invitation revocation. Confirmation must state the record and consequence, prevent double submission and restore focus correctly.

### P1-21 — Raw database errors reach users

Centralize PostgREST/Postgres error translation. Map known constraint/error codes to safe actionable text and send internal details only to structured logs. Never show schema/table/function names as primary UI copy.

### P1-22 — Analytics performs large in-memory aggregation

`_shared/reporting.ts` fetches pages of 1,000 visits and aggregates in the Edge Function, rejecting above roughly 50,000. Move grouped/count/time-bucket work into secured database functions or queries, retain tenant/branch authorization, review indexes and keep export streaming/pagination memory bounded. Use new migrations and security-review every RPC. References: [Supabase database functions](https://supabase.com/docs/guides/database/functions) and [Edge Function limits](https://supabase.com/docs/guides/functions/limits).

### P1-23 — Sensitive CSV export lacks product controls

Keep admin-only authorization and formula-injection protection. Add a PII warning/confirmation, export audit event, explicit date/branch scope, optional redacted export where useful, one active request, and safe filename from the server `Content-Disposition`. Reference: [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection).

### P1-24 — QR origin validation and branch status disagree

Use one canonical `APP_ORIGIN` parser shared by email and QR generation. Require a production HTTPS origin, reject paths/query/hash/credentials, and permit explicit localhost only in development. The QR page must warn/block printing for inactive branches and offer a test link.

### P1-25 — Analytics/report access states are generic

Handle inactive organization, inactive/unassigned operator, unavailable branch, forbidden report and service failure as different states. Do not let an unassigned receptionist discover the problem only through a generic function error.

## 10. Priority two: usability, resilience and administration

### P2-00A — Password controls are incomplete

Add password confirmation for signup/reset, show/hide controls with accurate accessible labels and useful Caps Lock feedback. Do not add a misleading visual “strength score” that disagrees with Supabase; the actual configured requirements remain authoritative.

### P2-00B — Organization-signup availability is discovered after submission

An eligible unassigned user can reach the organization form even when the Edge Function secret disables organization creation. Provide a safe server-derived availability state before showing an actionable form, while keeping the Edge Function's fail-closed check. Explain who to contact when self-service creation is unavailable.

### P2-00C — Host invalid states are conflated

The current host page uses “invalid or already opened” for missing, malformed, expired and consumed tokens before a request is made. After adding preview, provide controlled distinct copy for invalid, expired, already used and temporary network failure without exposing visit existence to arbitrary token probes.

### P2-00D — Host actions lack visible progress semantics

While approving/declining, set `aria-busy`, change button text to the active operation, disable both outcomes and prevent duplicate submission. On success, show the recorded outcome and a safe close-page instruction. On failure, preserve the token for retry unless the server confirms it is terminal.

### P2-00E — Auth and invitation pages are visually inconsistent

Bring verify-email, invite capture/acceptance, suspended and organization-creation states into the same accessible Auth shell, typography and error pattern. Consistency must not hide their different security semantics.

### P2-01 — Public directory data becomes stale on long-lived pages

Refresh safe branch/directory metadata on focus and at a reasonable interval, or subscribe to an intentionally minimal directory invalidation channel. Preserve the visitor's entered data where possible, but clear an invalid department/host selection and explain why it changed.

### P2-02 — Phone input is not Nigeria-friendly

Provide visible examples, a Nigeria default/country selector or reliable normalization, and explain the stored E.164 result. Accept ordinary user spacing/punctuation, normalize before validation and never silently reinterpret an ambiguous country code.

### P2-03 — Form validation is not consistently visible

Render every Zod/React Hook Form field error adjacent to its field, including preferred name, organization, email, purpose and department/host relationship errors. Use one reusable field pattern with stable IDs, `aria-invalid`, `aria-describedby` and error focus/summary behavior. Reference: [WCAG error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification) and [labels/instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions).

### P2-04 — Public Turnstile states are vague

Differentiate incomplete, expired, provider-load, network and server-verification failures. Reset correctly after attempted submission, retain non-sensitive form values and provide an accessible retry path.

### P2-05 — Visitor status errors are opaque

Show last successful update, automatic retry timing, manual retry, offline state and explicit expired-session behavior. Continue polling pending/on-site visits; reduce or stop polling after terminal state while retaining manual refresh.

### P2-06 — No visitor privacy notice

Add concise, organization-appropriate notice explaining who collects the data, purposes, visibility and retention, with a full policy link. Do not invent legal retention promises; obtain the approved policy and make configuration/content ownership explicit.

### P2-07 — Public host-directory exposure needs an explicit policy

The public branch directory exposes active host display names/departments to anyone with the QR URL. Confirm this business/privacy choice. Support a display-name policy and optionally department-first/no-host-name configurations without weakening server validation.

### P2-08 — Session-storage failure has no fallback

Wrap storage reads/writes in a typed helper. Keep in-memory status available when storage is blocked, explain the limitation and avoid a submission result disappearing because `setItem` throws.

### P2-09 — Operator dashboard is not an operational queue

In addition to fixing the 100-row problem, present actionable groups, wait durations, overdue indicators, counts, search and filters. Raw chronological cards are not sufficient for a reception queue.

### P2-10 — Raw status/type identifiers leak into UI

Create typed display-label/description mappings for statuses, visit types, event types, delivery states and roles. Do not scatter `replaceAll('_', ' ')` transformations. Unknown values need a safe fallback and telemetry.

### P2-11 — Checkout correction uses `window.prompt`

Replace prompts with an accessible dialog containing branch-local date/time input, timezone label, required reason, constraints, review step and server validation. Clearly show original versus corrected time. Keep the database as authority.

### P2-12 — History failure lacks retry

Add retry, error category and loading skeleton. Retain already loaded visit details while retrying history.

### P2-13 — Email delivery state is too coarse in the operator UI

Show whether review is saved, delivery is sending/sent/failed/unknown, last attempt time and appropriate action. For `unknown`, link admins to the recovery procedure and do not offer an unsafe blind resend. Receptionists should receive clear escalation copy.

### P2-14 — Initial management/access loading looks empty

Render loading skeletons/status instead of empty lists before `operator-directory` returns. Provide separate empty, error and unavailable states.

### P2-15 — Refresh failures after admin mutations are swallowed

An operation is not fully successful if the authoritative list cannot be refreshed. Preserve the mutation result, show “saved, but unable to refresh,” offer retry and avoid pretending the stale list is current.

### P2-16 — Access management uses a global busy flag

Use per-row/per-operation pending state. Prevent conflicting operations on the same record while allowing unrelated records to remain usable.

### P2-17 — Operator editor state can drift from props

Reset controlled editor state when the underlying operator record changes, or use React Hook Form `reset` with a stable record/version. Disable Save until dirty and valid. Warn before discarding dirty changes.

### P2-18 — Invitation status/history is incomplete

Classify pending, expired, accepted and revoked explicitly. Show branch, role, invited email, creation time, expiry, inviter if available, resend count, delivery state and last attempt. Do not fetch history and then hide it.

### P2-19 — Unknown invitation delivery is unsafe to resend blindly

Explain that `unknown` can mean the provider accepted the email. Require admin review/confirmation and preserve provider idempotency/recovery rules. Never label unknown as failed.

### P2-20 — Branch form validation disagrees with backend

The create form allows an empty address while `create-branch` requires it. Make the client schema, field label, Edge validation and database contract identical. Trim whitespace and show field-level errors before submitting.

### P2-21 — Auto-close time can be empty when enabled

Require a valid local time when enabled, display timezone and validate before the database request. Disabling should write `null` intentionally.

### P2-22 — Auto-close timing is underexplained

Explain that scheduled processing may run after the selected minute, display the branch timezone and document behavior for visits admitted after that day's configured time. Verify deployed Cron configuration before promising a maximum delay.

### P2-23 — Admin forms have inconsistent pending/success behavior

Every mutation must have pending text/`aria-busy`, duplicate-submit prevention, success acknowledgement, cleared stale errors and authoritative refresh. Do not rely on a visually disabled control alone.

### P2-24 — Whitespace-only values pass some HTML-required checks

Use trimmed shared schemas for organization, branch, department and staff names. Mirror server/database length and format constraints where practical.

### P2-25 — Department rename uses `window.prompt`

Replace it with an inline editor or accessible dialog with validation, cancel behavior, dirty state and pending feedback.

### P2-26 — Admin lists do not scale

Add search, active/inactive filters, counts and pagination/virtualization as appropriate. Avoid serializing all organization staff/invitations into every management tab indefinitely.

### P2-27 — Every management change refreshes every dataset

Replace indiscriminate `router.refresh()` with targeted query invalidation/refetch where safe. Keep a full refresh fallback after cross-cutting changes. Measure before introducing unnecessary complexity.

### P2-28 — Management tabs are client-only state

Use route segments or a query parameter for deep-linkable Organization, Branches, Directory and Access views. If tabs remain, implement `tablist`, `tab`, `tabpanel`, keyboard navigation and correct selection state rather than `aria-current` on ordinary buttons.

### P2-29 — Organization settings are too narrow

At minimum explain that only the organization name is editable. Do not imply that retention, branding, notification or policy settings exist. Add new settings only from approved product requirements.

### P2-30 — Empty states are missing

Create actionable empty states for no branches, departments, staff, operators, invitations, visits and report results. State why the list is empty and which authorized role can resolve it.

## 11. Priority two: analytics and QR details

### P2-31 — Analytics freshness is implicit

Configure deliberate TanStack Query defaults for reports. Historical reports should have an explicit `staleTime`, manual refresh and “as of” timestamp; do not accept the default stale-immediately/window-focus behavior accidentally. References: [TanStack Query `useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery) and [window-focus refetching](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching).

### P2-32 — Filter changes can start overlapping expensive reports

Pass and honor an `AbortSignal` where possible, debounce free-form/custom range changes, require explicit Apply for expensive ranges, and disable impossible date ranges before invoking the backend.

### P2-33 — Empty analytics results lack explanation

Distinguish no matching visits, no access, inactive organization/branch and report failure. Preserve filters and offer a clear reset.

### P2-34 — Multi-branch timezone policy is hidden

Use the returned `timezone_policy`, `branch_ranges`, effective start and end values. Explain that all-branch presets use each branch's local calendar day and provide branch range details on request.

### P2-35 — Analytics labels are machine-oriented

Format hours as local times such as `09:00`, use friendly status/type labels, include timezone and use locale-appropriate dates. Do not show raw ISO timestamps as primary copy.

### P2-36 — Charts need non-visual equivalents

Keep Recharts' `accessibilityLayer` enabled, add a concise text summary and an accessible data table/toggle for daily/hourly values. Ensure tooltip-only information is also keyboard/screen-reader available. Reference: [Recharts API](https://recharts.github.io/en-US/api/).

### P2-37 — Export can be triggered repeatedly

Give export its own busy/progress state, allow only one active export per filter set and clear stale errors when filters change.

### P2-38 — Export filename ignores useful server metadata

Honor a safely parsed `Content-Disposition` filename or generate one consistently from effective branch/start/end values. Sanitize filename characters. Include custom date ranges.

### P2-39 — Report JSON has no runtime validation

Validate the Edge response with Zod or another small runtime schema before rendering. Treat schema mismatch as a controlled compatibility error and log a safe diagnostic.

### P2-39A — CSV encoding compatibility is not explicit

Verify the exported UTF-8 CSV in the spreadsheet applications the organization actually uses. Add a UTF-8 BOM only if required by that compatibility target; document the choice and retain formula-injection protection. Do not change encoding based on assumption alone.

### P2-40 — QR print contains interactive/navigation UI

Hide Manage/Copy/Test controls under print CSS. Define print margins/page sizing, avoid clipped QR codes and print branch name plus safe fallback URL.

### P2-41 — QR accessibility is incomplete

Give the QR graphic a branch-specific accessible name/description. Explain that the visible URL is an alternative. Ensure contrast and quiet-zone sizing are preserved.

### P2-42 — QR URL can overflow

Apply safe wrapping/word breaking on phone and print layouts without altering the encoded URL.

### P2-43 — QR management lacks practical actions

Add Copy link, open/test link and download QR image/print view. Show branch active status and the exact destination before printing. Do not introduce slug rotation without an approved invalidation/migration plan.

## 12. Priority two: accessibility and responsive requirements

### P2-44 — Error/status live regions are inconsistent

Use `role="alert"` for errors needing immediate attention and polite status regions for progress/success. Avoid repeatedly announcing unchanged content. Never use the same styling/role for success and failure.

### P2-45 — Links depend too heavily on color

Restore underlines or another non-color affordance for inline links, with visible focus and hover states. Navigation buttons/links must remain visually distinguishable by role.

### P2-46 — Touch targets need systematic review

Meet WCAG 2.2 target-size/spacing requirements and prefer approximately 44px comfortable controls for reception/mobile use, even though WCAG AA's formal minimum is 24px with exceptions. Reference: [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

### P2-47 — No skip link

Add a keyboard-visible “Skip to main content” link and a stable main-content target in shared authenticated layouts.

### P2-48 — Textarea/input styling is inconsistent

Include `textarea` in typography, color, focus, disabled and error styling. Do not remove browser focus indicators without an equal or stronger replacement.

### P2-49 — Mobile layouts need workflow verification

Verify at 320px phone width, common modern phones, portrait shared tablets and desktop. Test long names, URLs, error text, keyboard opening, chart tooltips, admin editors and dense action rows. Support zoom/reflow without horizontal page scrolling except genuinely two-dimensional data.

### P2-50 — Focus management is incomplete

On validation failure focus the first invalid field or error summary; after dialogs return focus to the opener; after shared-tablet reset focus the form heading; after route/loading errors provide logical navigation. Avoid focus loss after conditional rendering.

### P2-51 — Irreversible actions need error prevention

For cancellation, decline, deactivation, revocation, checkout correction and export of PII, identify the target, summarize consequences and allow review/cancel. Reference: [WCAG input assistance](https://www.w3.org/WAI/WCAG22/Understanding/input-assistance).

## 13. Priority three: observability, performance and polish

### P3-01 — No consistent offline experience

Observe browser connectivity as a hint, not authority. Disable or queue nothing silently. Show offline state, preserve unsent form values and retry explicitly when online.

### P3-02 — No client-visible request timeout policy

Use `AbortController`/timeouts appropriate to each request. Distinguish user cancellation, timeout and provider uncertainty. A timeout after an email provider request starts must remain `unknown`, not assumed failed.

### P3-03 — No apparent error-monitoring integration

Add approved server/client monitoring with environment, release and safe correlation IDs. Scrub PII, tokens, email bodies and secrets. Error pages may show a correlation ID but not internal details.

### P3-04 — Realtime invalidation is chatty

Coalesce bursts, avoid local-action plus broadcast duplicate refetches and consider targeted cache updates only where authoritative status-machine semantics remain intact. Measure query volume before and after.

### P3-05 — Operator actions are not optimistic

This is not inherently a defect; authoritative refetch is safer. If adding optimistic feedback, show it as pending and roll back on error. Never optimistically represent admission/checkout as committed before the database confirms it.

### P3-06 — Expanded card state can surprise across branches

Clear or key expanded visit state by branch. Switching branches should not reopen an unrelated card when returning unless intentionally remembered.

### P3-07 — Assisted form lacks a clear cancel/reset action

Provide Reset/Cancel with confirmation only when dirty. Keep branch context visible.

### P3-08 — Page metadata is generic

Add appropriate page titles/descriptions and `noindex` for private/auth/decision pages where deployment requirements allow. Never put visitor names or tokens in metadata.

### P3-09 — Public and operator freshness models are invisible

Show last-updated/reconnecting state where it affects decisions. Public status uses polling; operator queue uses Realtime plus refetch. Make those guarantees understandable without exposing technical jargon.

### P3-10 — Configuration failures occur too late

Validate required server/public configuration at appropriate startup/request boundaries and render a controlled deployment-error page. `proxy.ts` should remain session-cookie refresh infrastructure, not a substitute for page/RPC authorization. Reference: [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

### P3-11 — Auto-close UI promises more precision than the scheduler may provide

Verify live Cron cadence, expose approximate execution semantics and monitor failed runs. Do not infer production configuration from local migrations alone.

### P3-12 — Generated Edge types lag current RPCs

After applying migrations to the intended schema, regenerate types with the official CLI, review the diff and remove unsafe casts. Keep hosted-schema type comparison in CI.

### P3-13 — Frontend static checks do not cover Edge Functions

Retain separate Deno checks/tests in CI and document them in the standard local validation path. A passing `next build` is not evidence that deployed functions compile.

## 14. Legacy-code removal plan

The user explicitly requires all legacy application code to be removed. Do not merely stop rendering it.

### 14.1 Confirmed legacy frontend/API targets

The current reference graph identifies these as the old implementation or handlers used only by it:

- `app/legacy-home.tsx`
- `app/check-in/[token]/legacy-check-in.tsx`
- `lib/guests.ts`
- `app/api/reception-team/route.ts`
- `app/api/visitors/[id]/approve/route.ts`
- `app/api/self-checkout/request-code/route.ts`
- `app/api/self-checkout/verify-code/route.ts`

The last two are referenced by the legacy check-in component. Remove them; do not build replacement self-service functionality in this work.

### 14.2 Routing cleanup

- Change `app/page.tsx` so `/` always enters the new start/onboarding decision flow; it must never import/render `LegacyHome`.
- Change `app/check-in/[token]/page.tsx` so it never imports/renders `LegacyCheckIn`. If the new public frontend is disabled, return an explicit unavailable/not-found rollout state, not the old UI.
- Remove cutover language from README and other docs.
- Review whether rollout flags are still needed. Retaining flags as availability switches is acceptable; retaining them to route users back to old code is not.
- Remove the temporary `HOST_DECISION_ORIGIN` fallback after all environments use canonical `APP_ORIGIN`.

### 14.3 Dependency and utility cleanup

- After deleting old API mail handlers, check whether the Next.js `resend` dependency is unused. Active Edge Functions call Resend over HTTP and do not require the Next package. Remove it with the package manager if unused
- Retain `lib/http/same-origin.ts` because active invitation cookie routes use it.
- Search for old table names, old environment variables, old status names and dead CSS/assets. Remove only after tracing all callers.
- Remove or rewrite tests that solely assert deleted legacy behavior. Add coverage for the replacement new route behavior.

### 14.4 Database cleanup boundary

- Do not edit or delete historical migrations that created old objects.
- Inventory the live database before dropping any legacy table/function/policy/trigger. Repository non-use is not proof of no external/live consumer.
- If live legacy database objects are approved for removal, create a new descriptive migration, check dependencies, back up required data and verify local reset plus staged deployment.
- Do not delete data merely because a TypeScript file was legacy.

### 14.5 Legacy-removal acceptance criteria

- `rg` finds no imports/references to the deleted legacy components, APIs or `lib/guests.ts` outside historical documentation that intentionally records the migration.
- Production build exposes no old API routes.
- `/` and `/check-in/[token]` cannot render the old UI under any flag combination.
- No unused `resend` Next.js dependency remains.
- README/environment documentation describes only the supported architecture.
- New public, auth, operator and host flows pass their relevant browser tests.

## 15. Feature-specific acceptance checklist

### Authentication/onboarding

- Auth CAPTCHA matches deployed configuration.
- Password rules are visible and consistent.
- Callback/recovery errors are actionable.
- Invitation details are visible before acceptance and retry state survives transient failure.
- Verify-email and suspended states have clear exits.

### Public check-in

- Shared tablets can serve consecutive visitors.
- Valid QR outage is distinguishable from invalid/inactive branch.
- Directory changes are handled safely.
- Phone and field validation are understandable and accessible.
- Privacy and status freshness are visible.

### Host decision/email

- Exactly one active server-side host-email workflow exists.
- Email secrets never enter the browser.
- Host page previews the correct request without consuming the token.
- Refresh does not unnecessarily lose the token.
- Approval/decline consumes it once and updates operator state.
- Unknown delivery never triggers a blind automatic resend.

### Operator

- All active visits remain visible regardless of history volume.
- Realtime failures are visible and recoverable.
- Actions and event history remain synchronized.
- Visit edits are audited.
- Branch changes cannot redirect dirty assisted submissions silently.

### Administration

- Dependency-aware deactivation prevents stranded visits/staff.
- Direct database errors are translated.
- Mutations have pending, success and failure states.
- Invitation delivery/expiry/history are honest and complete.
- Lists remain usable at realistic organization sizes.

### Analytics/export

- Reports scale through database-side aggregation or another measured bounded design.
- Timezone semantics and freshness are visible.
- Charts have accessible tables/summaries.
- Export is single-flight, audited, scoped and accompanied by a PII warning.

### QR

- Feature access and branch active state are consistent.
- Origin validation is shared and strict.
- Printed output contains only useful print content and remains scannable.
- Copy/test/download and accessible alternatives work.

## 16. Recommended delivery sequence

Do not attempt all findings in one commit.

1. Baseline: record current routes, live configuration assumptions and validation results.
2. Remove legacy UI/API code and make new routing deterministic, while preserving current new-flow behavior.
3. Fix Auth CAPTCHA/password/recovery/onboarding blockers.
4. Add shared error parsing, error boundaries, loading states and expected-state pages.
5. Fix shared-tablet session handoff and public check-in resilience/accessibility.
6. Implement host preview/token continuity and clean email shared modules.
7. Replace the operator newest-100 list with operational queue plus history pagination; add Realtime health/fallback.
8. Add visit-edit auditing and synchronize visit/history caches.
9. Add admin dependency preflights, confirmations, scalable lists and invitation-state improvements.
10. Move report aggregation to a bounded database-side design and improve CSV controls.
11. Finish QR, chart, accessibility, responsive and observability work.
12. Run full local/staging validation and document remaining live-only checks.

Each phase must leave the application buildable. Schema-dependent UI must not deploy before its migration/function contract is available.

## 17. Validation requirements

### Repository/static checks

Run at minimum:

```bash
npm run format:check
npm run lint -- --max-warnings=0
npm run typecheck
npm run typecheck:test
npm run test:unit
npm run build
npm run test:e2e
```

Also run the CI-equivalent Deno checks/tests for every Edge Function, SQL transaction tests, local migration reset, database lint/advisors and hosted type comparison used by this repository.

### Required scenario validation

- Sign up, sign in, reset and CAPTCHA expiry/error.
- Invitation capture, refresh, sign-in, acceptance, retryable failure, expiry and wrong email.
- Shared-tablet consecutive visitors.
- Public check-in retry/idempotency and status through every visit terminal state.
- Operator queues with more than 100 historical visits and older active visits.
- Realtime connected, rejected, disconnected, reconnecting and fallback modes.
- Operator access revoked while the dashboard is open.
- Host email sent/failed/unknown and provider-confirmed recovery.
- Host link refresh, preview, approve, decline, expired and already consumed.
- Branch/department/staff/operator deactivation with and without dependencies.
- Visit edit audit history.
- Analytics across multiple branch timezones and large ranges.
- CSV PII confirmation, formula-injection cases and filename handling.
- Active/inactive branch QR screen and printed output.
- Keyboard-only, screen-reader-oriented semantics, 200% zoom/reflow and common phone/tablet widths.

### Live-environment checks

Repository configuration is not evidence of deployed state. Verify:

- Hosted Auth CAPTCHA, password, confirmation and redirect settings.
- Edge Function secrets and deployed versions.
- Realtime private-channel setting and RLS policies.
- Applied migration order and generated types.
- Resend domain/from address, delivery logs and idempotency behavior.
- Cron cadence and failed-run monitoring.
- `APP_ORIGIN` for every environment.
- Security and performance advisors.

## 18. Official documentation index

Use current official documentation when implementing; these links were checked during preparation of this handoff.

### Next.js

- [App Router error handling](https://nextjs.org/docs/app/getting-started/error-handling)
- [Linking, navigation, loading and streaming](https://nextjs.org/docs/app/getting-started/linking-and-navigating)
- [`proxy.ts` convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [App Router file conventions](https://nextjs.org/docs/app/api-reference/file-conventions)

### Supabase

- [Supabase changelog — breaking changes](https://supabase.com/changelog?types=breaking-change)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Invoking Edge Functions](https://supabase.com/docs/guides/functions/quickstart#usage)
- [Edge Function error handling](https://supabase.com/docs/guides/functions/error-handling)
- [Supabase JS error handling](https://supabase.com/docs/guides/api/handling-errors-in-supabase-js)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Auth CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [Password security](https://supabase.com/docs/guides/auth/password-security)
- [Password-based Auth/recovery](https://supabase.com/docs/guides/auth/passwords)
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Realtime settings](https://supabase.com/docs/guides/realtime/settings)
- [Realtime protocol](https://supabase.com/docs/guides/realtime/protocol)
- [Realtime `setAuth`](https://supabase.com/docs/reference/javascript/setauth)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions and function security](https://supabase.com/docs/guides/database/functions)
- [Supabase Advisors](https://supabase.com/docs/guides/observability/advisors)

### Data fetching/forms/charts/email

- [TanStack Query `useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery)
- [TanStack Query window-focus refetching](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching)
- [TanStack Query polling](https://tanstack.com/query/latest/docs/framework/react/guides/polling)
- [React Hook Form documentation](https://react-hook-form.com/docs)
- [Recharts API and accessibility layer](https://recharts.github.io/en-US/api/)
- [Recharts responsive container](https://recharts.github.io/api/ResponsiveContainer/)
- [Resend idempotency keys](https://resend.com/changelog/idempotency-keys)
- [URI fragments are client-side](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)

### Accessibility/security

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)
- [WCAG labels or instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions)
- [WCAG target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG input assistance](https://www.w3.org/WAI/WCAG22/Understanding/input-assistance)
- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection)

## 19. Known resolved or corrected audit notes

Do not create unnecessary work from stale findings:

- `.env.example` currently includes `TURNSTILE_ALLOWED_HOSTNAME`; verify its deployment value, but it is no longer missing from the template.
- The latest migration intentionally preserves visitor-session access to terminal state; do not reintroduce immediate terminal revocation. The missing piece is shared-tablet acknowledgement/reset.
- Branch deactivation is already blocked at the database layer when active visits exist. Improve the UI preflight/error, do not duplicate or remove the invariant.
- Recharts' accessibility layer defaults to enabled. The remaining requirement is meaningful summary/table access and verified keyboard/screen-reader behavior.
- Review persistence before email delivery is intentional. Preserve the separation and improve delivery-state presentation.

## 20. Definition of done

This remediation is not complete merely because the UI looks better or `next build` passes.

It is complete when:

- No legacy frontend/API code or fallback remains.
- All priority-zero and priority-one requirements have implementation evidence and scenario coverage.
- Expected failures have explicit, recoverable UI.
- No active visit can be lost behind history pagination.
- Shared tablets can handle consecutive visitors safely.
- Hosts can identify the request before acting and do not lose the link on an ordinary refresh.
- Email delivery and retry semantics remain idempotent and honest.
- Admin dependency changes cannot strand operational work without warning.
- Analytics remains bounded at realistic volume.
- Keyboard, screen-reader, mobile and print experiences meet the documented acceptance criteria.
- Database authorization, token handling, auditability and existing lifecycle invariants are preserved.
- Local checks pass and live-only configuration has been verified separately.
