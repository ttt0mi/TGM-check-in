# TGM Check-in

A visitor-management portal for companies. Visitors scan one reusable reception QR code, enter their contact details, choose the employee they are visiting, 
and give a reason for their visit. Their arrival waits for an administrator to approve it; approval checks them in and emails the selected host.
This project is in development. Its new location-based backend uses Supabase and Edge Functions. 
The current Next.js portal is an earlier prototype and does not work with that backend; 
it will be rebuilt. The host-decision page is also still to be built.

## Features

- Daily reception dashboard showing today's visitors, visitors currently on site, and completed visits.
- Reusable company reception QR code and mobile visitor request form.
- Visitor first and last name, optional middle name, phone number, email, company, employee host, and visit purpose.
- Admin approval queue, host email notifications, visitor log, status filters, and manual check-in/check-out.
- Employee directory with host names and work email addresses.
- Daily, weekly (Sunday–Saturday), and monthly reports calculated from stored visitor records, filterable by visit purpose.

## Get started

You will need Node.js, npm, a Supabase account, a new Supabase project and a resend account

1. Clone the repository and install its dependencies:

   ```bash
   git clone https://github.com/ttt0mi/TGM-check-in.git
   cd TGM-check-in
   npm install
   ```

2. In your Supabase project's dashboard, open **Authentication → Providers →
   Email**, enable email/password authentication and **Confirm email**. The
   settings in `supabase/config.toml` only apply to local development.
3. Link the project and apply all migrations before creating any accounts:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```
to see what migration files supabase will push without actually pushing, run:
```bash
npx supabase db push --dry-run
```

   Use a fresh, dedicated Supabase project. The migrations create and then
   remove tables from the earlier prototype, so review them before applying
   them to a database containing anything you need to keep. If migrations have
   already been applied, use `db push` to apply the remaining migrations;
   don't reset the database.
4. Register the first customer organization using the steps below.

### Register a customer organization

After email confirmation, an unassigned user can call the authenticated
`register-organization` Edge Function with `{ "name": "Company name" }`.
The database atomically creates the organization and makes that user its first
customer admin. This endpoint is disabled until the server-only
`TGM_ENABLE_ORGANIZATION_SIGNUP=true` flag is set. Leave it disabled until the
tenant migration and Edge Functions have passed the rollout checks in
[the tenancy runbook](docs/tenancy-foundation.md).

Customer admins can create branches with `create-branch`, create a seven-day
operator invitation with `invite-operator`, and assign or deactivate existing
members with `manage-operator`. `invite-operator` returns a one-time token for
later delivery by the frontend; it does not send email in this backend phase.
A signed-in user with the invited, verified email accepts it with
`accept-operator-invite`. An account cannot join a second organization.

Platform administrators are separate from customer admins. A trusted database
owner provisions one manually in `tgm_private.platform_administrators` after
verifying the account. This does not grant access to customer visit data.
The replacement signup and invitation UI is not implemented yet; the current
prototype UI still uses the removed `guests` model.

### create resend account
Create a Resend account, verify a sender domain/address, and set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the server environment. Do not prefix these values with `NEXT_PUBLIC_`.


## Deploy the backend functions

Configure these Edge Function secrets in Supabase, then deploy the functions
with Supabase CLI:

- `TURNSTILE_SECRET_KEY` and `TURNSTILE_ALLOWED_HOSTNAME`: the Cloudflare
  Turnstile secret and the exact hostname expected for verification.
- `HOST_DECISION_ORIGIN`: the HTTPS origin that will host `/host-decision`.
  That page must consume the decision token from the URL fragment and has not
  been built yet.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: the Resend API key and a verified
  sender address.

Deploy with the Supabase CLI after linking the intended project 
and applying its migrations: 
```bash
npx supabase functions deploy --project-ref YOUR-SUPABASE-PROJECT-REFERENCE --use-api --import-map supabase/functions/deno.json
npx supabase secrets set TURNSTILE_SECRET_KEY=... TURNSTILE_ALLOWED_HOSTNAME=... HOST_DECISION_ORIGIN=... RESEND_API_KEY=... RESEND_FROM_EMAIL=...
```

to generate supabase typescript type definitions for local development
```bash
npx supabase gen types typescript --project-id YOUR-SUPABASE-PROJECT-REFERENCE --schema public > PATH-TO-SUPABASE-FOLDER
```
Keep secrets server-side. Supabase supplies its own URL and API keys to the
functions. See [Supabase's function secrets guide](https://supabase.com/docs/guides/functions/secrets).

The public check-in limit is 30 verified submissions per client IP and location
per five-minute window. It uses the first `X-Forwarded-For` address, as in
Supabase's [Turnstile example](https://supabase.com/docs/guides/functions/examples/cloudflare-turnstile).
The application limit is best effort, not a sole abuse-prevention control;
missing IPs share a fallback bucket.

For uncertain host email outcomes, investigate the provider's logs before
retrying: a message may already have been accepted. See the
[email recovery guide](docs/host-email-recovery.md) for details.

Clients must generate a UUID `idempotency_key` for each assisted check-in and
reuse it with the same request body when retrying. A different request or actor
cannot reuse that key. The key is retained for the lifetime of its visit.

Public check-ins also need a new UUID `idempotency_key` for each new visit.
Retry the same details with the same key; changing the details requires a new
key. Reusing a key with different details returns HTTP 409 rather than accepting
the wrong visit. A completed retry does not need a new Turnstile token. Keys are
retained for the lifetime of their visit.

The replacement visitor frontend can optionally create a 24-hour visitor
status session when a QR check-in is submitted. The QR code identifies the
branch; the session is a separate secret that lets that visitor's browser poll
the limited status of that one visit for 24 hours, including its final outcome.
The session remains read-only and cannot be reused for another check-in.
Checkout provenance, administrative
corrections, token requirements, and the public status endpoint are documented
in [the lifecycle contract](docs/visit-lifecycle-accountability.md). Actual
self checkout remains disabled until the geofence and face-verification phase.


## Local development

Run `npm run dev` to start the prototype UI in demo mode. It does not exercise
the new backend. Supabase local migrations can be checked with the CLI and
Docker; local seeding is disabled until a seed file is provided.
