# Tenancy foundation rollout

The tenant migration preserves existing location IDs, public QR slugs, visit
IDs, and the request shape of existing visit Edge Functions. It assigns existing
application rows and active operators to a single `Legacy TGM Demo` customer
organization. No existing admin becomes a platform administrator.

## Before deployment

1. Keep `TGM_ENABLE_ORGANIZATION_SIGNUP` unset. Take a database backup. Record
   row counts for `locations`, `departments`, `staff`, `visits`,
   `operator_profiles`, and `receptionist_location_assignments`; record all
   `locations.id` and `locations.public_slug` values.
2. Apply the migration to a fresh local database and a restored copy of the
   current database. Verify counts and QR values are unchanged, all tenant IDs
   are populated, and no cross-tenant composite foreign key can be violated.
3. Deploy the updated Edge Functions and keep organization registration disabled.
   Test public directory/QR submission and retries, assisted submission,
   receptionist actions, host email/decision, Realtime authorization, and
   auto-close. Run the two-organization isolation tests.
4. Enable `TGM_ENABLE_ORGANIZATION_SIGNUP=true` only after the checks pass.
   The later frontend phase will provide the signup and invitation screens.

The SQL regression files are `supabase/tests/tenant_backfill_seed.sql`,
`tenant_backfill_verify.sql`, `tenant_isolation.sql`, and
`public_checkin_retries.sql`. Run the seed against a database with all earlier
migrations, apply `tenant_foundation.sql`, then run the verify
file. Run the isolation and retry files against the migrated database; both
tests roll back their fixtures. The backfill verification checks row counts,
visit references, operator memberships, and every location ID and QR slug.

Private Realtime channels use `tgm:location:<branch-id>` and the
`tgm_location_broadcast_read` policy. Realtime caches a subscription's access
decision until its JWT refreshes or expires. A reassigned or deactivated
operator is denied on a new subscription immediately; an already connected
channel can continue receiving messages until the old JWT expires. Keep Auth
JWT lifetimes short and make clients refresh their Realtime token when their
operator assignment changes. Do not treat an open channel as proof of current
authorization for any privileged action.

Do not use a customer admin account as a platform administrator. To designate
one, a trusted database owner verifies the intended Supabase Auth user and
inserts its user ID into `tgm_private.platform_administrators`. This table has
no client grants and provides no customer-data bypass. Support access to a
customer's visit data is outside this phase.

## Backend onboarding contract

All four endpoints require a verified Supabase Auth user JWT and return
`Cache-Control: no-store`.

| Endpoint | Request | Result |
| --- | --- | --- |
| `register-organization` | `{ "name": string }` | `{ "organization_id": uuid }`; one organization per account; rollout flag required |
| `create-branch` | `{ "name": string, "address": string, "timezone": IANA_name }` | `{ "location_id": uuid }`; customer admin only |
| `invite-operator` | `{ "email": string, "role": "admin" \| "receptionist", "location_id"?: uuid }` | `{ "invitation_id": uuid, "token": string, "expires_in_days": 7 }`; customer admin only; deliver token out of band until UI exists |
| `accept-operator-invite` | `{ "token": string }` | `{ "organization_id": uuid }`; verified email must match invitation |

`manage-operator` can now update or deactivate only members of the caller's
organization. Initial membership goes through invitation acceptance. A
receptionist may have only one branch assignment.
