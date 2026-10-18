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

   Use a fresh, dedicated Supabase project. The migrations create and then
   remove tables from the earlier prototype, so review them before applying
   them to a database containing anything you need to keep. If migrations have
   already been applied, use `db push` to apply the remaining migrations;
   don't reset the database.
4. Create the first admin using the steps below.

### Create the first admin

Complete the migrations and enable email confirmation before following these
steps. This setup is for one initial admin and does not require SQL.

1. In Supabase, go to **Authentication → Users**, choose **Add user**, and
   send an invitation to the email address of the person who will be admin.
2. Have that person open the invitation and verify their email. Check that the
   user's email is confirmed in the dashboard, then copy their user ID. Make
   sure your Supabase Auth site URL is configured for the invitation redirect.
3. Open **Table Editor → operator_profiles**. Find the row whose `user_id`
   matches that user ID. If the row is missing, stop and check that all
   migrations and the account-creation trigger are in place.
4. Confirm there is no active admin already. Edit the matching row and save
   `role` as `admin` and `is_active` as `true` together.

Only a trusted project owner should have dashboard access to perform this
setup. Subsequent operators are managed by an active admin. An operator's live
profile controls application access; deactivation does not ban their Supabase
Auth sign-in. The replacement portal and its invitation/password setup are
not implemented yet, so provisioning an admin does not make the current
prototype a working admin portal.

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
npx supabase functions deploy
npx supabase secrets set TURNSTILE_SECRET_KEY=... TURNSTILE_ALLOWED_HOSTNAME=... HOST_DECISION_ORIGIN=... RESEND_API_KEY=... RESEND_FROM_EMAIL=...
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


## Local development

Run `npm run dev` to start the prototype UI in demo mode. It does not exercise
the new backend. Supabase local migrations can be checked with the CLI and
Docker; local seeding is disabled until a seed file is provided.