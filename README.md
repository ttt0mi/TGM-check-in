# TGM Check-in

TGM Check-in is a branch-based visitor management application. The Supabase backend handles tenancy, visit lifecycle, host decisions, and operator authorization. The Next.js frontend provides visitor check-in, host decisions, account onboarding, reception operations, organization management, and analytics.

The frontend is being released route by route. Production feature flags default to off; local development defaults to on. The old demo page and its API routes remain available during the cutover.

## Local setup

Use Node.js 22, npm, Docker, the Supabase CLI, and Deno 2.

```bash
npm ci
cp .env.example .env.local
npx supabase start
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the intended Supabase environment. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for QR submissions. Set `APP_ORIGIN` to the frontend origin for invitation and host links and printable QR codes. Keep `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_SECRET_KEY`, and `TURNSTILE_SECRET_KEY` server-side.

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

The backend functions require `APP_ORIGIN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_ALLOWED_HOSTNAME` in the deployed Supabase environment. `HOST_DECISION_ORIGIN` is supported temporarily as a fallback for `APP_ORIGIN`. Configure Supabase Auth email confirmation and redirect URLs for `/auth/callback` and `/reset-password` in each environment. Invitation and host links carry their tokens in URL fragments, which the frontend removes from the address bar.

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
