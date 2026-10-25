# TGM Check-in

TGM Check-in is a branch-based visitor management application. The Supabase backend handles tenancy, visit lifecycle, host decisions, and operator authorization. The Next.js frontend provides visitor check-in, host decisions, account onboarding, reception operations, organization management, and analytics.

The current application starts at `/start`. Production feature flags control route availability and local development defaults to enabled. Disabled routes show an explicit unavailable state. The acceptance contract for the remaining rollout is [the frontend remediation handoff](docs/frontend-ui-remediation-handoff.md).

## Local setup

Use Node.js 22, npm, Docker, the Supabase CLI, and Deno 2.

```bash
npm ci
cp .env.example .env.local
npx supabase start
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the intended Supabase environment. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for QR and Auth submissions. Set `APP_ORIGIN` to the frontend origin for invitation and host links and printable QR codes. Keep `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, and `TGM_RECOVERY_INTENT_SECRET` server-side. The recovery intent secret must contain at least 32 characters and be shared by all frontend instances in one environment.

Local Supabase migrations run with `supabase start`. Existing migration files must never be edited; add a new timestamped migration for changes. Generate database types only with the official Supabase CLI after applying schema changes to the intended environment.

## Frontend rollout flags

Set the following server-side variables to `true` to enable routes in production:

| Flag                             | Routes                                                                  |
| -------------------------------- | ----------------------------------------------------------------------- |
| `TGM_FRONTEND_PUBLIC_ENABLED`    | `/check-in/[token]`                                                     |
| `TGM_FRONTEND_HOST_ENABLED`      | `/host-decision`                                                        |
| `TGM_FRONTEND_AUTH_ENABLED`      | Sign-in, signup, recovery, invite acceptance, and organization creation |
| `TGM_FRONTEND_OPERATOR_ENABLED`  | `/app` reception dashboard                                              |
| `TGM_FRONTEND_ADMIN_ENABLED`     | `/app/manage` and branch QR pages                                       |
| `TGM_FRONTEND_ANALYTICS_ENABLED` | `/app/analytics`                                                        |

`TGM_ENABLE_ORGANIZATION_SIGNUP` is a separate **Supabase Edge Function secret**. Leave it disabled until the tenant rollout checks in [the tenancy runbook](docs/tenancy-foundation.md) pass. A verified, unassigned user can then create an organization and become its first admin. Customer admins can create branches and email operator invitations. Invited users sign in with the invited address before accepting. Platform administrators are provisioned manually and do not automatically receive customer visit access.

The backend functions require `APP_ORIGIN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAME`, and `HOST_PREVIEW_RATE_SECRET` in the deployed Supabase environment. Host and invitation Edge Functions use the pinned Resend SDK in `supabase/functions/deno.json`; the Next.js app does not send email. Configure Supabase Auth email confirmation and redirect URLs for `/auth/callback` and `/auth/recover` in each environment. Install the recovery email template from `supabase/templates/recovery.html` in each hosted project; its token hash stays in a URL fragment until the user explicitly continues. Invitation and host links also carry their tokens in fragments. The temporary `HOST_DECISION_ORIGIN` fallback must be removed after each deployed environment confirms `APP_ORIGIN`.

## Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm run typecheck:test
npm run test:unit
npm run build
npm run test:e2e
```

The browser suite starts a local mock Supabase endpoint and a Next.js development server; run `npx playwright install chromium` once first. CI also runs Deno checks and tests, SQL transaction tests, database lint, and hosted database type comparison. Browser tests use only local mock data and do not send email.

## Visit contract

A QR code identifies one branch. The visitor clock offers 12-hour and 24-hour branch-local time plus a stopwatch. The stopwatch starts from the recorded admission time and freezes at the recorded checkout time. On submission, the browser creates a separate 24-hour visitor status token in tab storage. A declined, cancelled, checked-out, or auto-closed visit remains readable until token expiry; terminal visits do not expose another check-in or checkout action. Self checkout remains disabled until the geofence and face-verification phase. See [the lifecycle contract](docs/visit-lifecycle-accountability.md) and [email recovery guide](docs/host-email-recovery.md).

Analytics date presets use each branch's local calendar day. Organization-wide totals combine those branch-local periods. CSV export is restricted to customer admins and escapes spreadsheet formulas.
