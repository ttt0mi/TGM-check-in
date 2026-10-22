# Visit lifecycle accountability

The lifecycle backend records how a visit ended, which branch handled the
departure, and which operator performed an assisted action. A visit remains
bound to its original check-in branch. The checkout branch therefore always
matches `visits.location_id`.

## Checkout provenance

`visits.checkout_method` is one of `self`, `receptionist_assisted`,
`system_auto_close`, or `admin_correction`. Self checkout is reserved for the
later geofence and face-verification phase and is not currently exposed by an
endpoint.

The existing `checkout` action on `reception-visit-action` records a
receptionist-assisted checkout. The `correct_checkout` action requires an
active organization admin and accepts:

```json
{
  "visit_id": "visit-uuid",
  "action": "correct_checkout",
  "patch": {
    "reason": "Required explanation, up to 500 characters",
    "time_out": "2026-10-22T15:30:00Z"
  }
}
```

`time_out` is optional and defaults to the current time. It cannot be before
arrival or admission or later than the current time. Correcting a completed
visit preserves its original checkout method and appends a
`checkout_corrected` event containing the old value, new value, actor, role,
branch, organization, and reason. Correcting an active on-site visit closes it
with the `admin_correction` method. Corrections never reopen visits.

## QR visitor sessions

The replacement frontend may add `visitor_session_token` to the existing
`submit-public-visit` request. It must be a cryptographically random 32-byte
value encoded as 43 unpadded base64url characters. Generate and retain it
before the first submission so an exact retry uses the same token.

The backend stores only its SHA-256 hash. The token is bound to the submission
idempotency key, so changing it during a retry returns HTTP 409. Calls that
omit the field preserve the previous behavior and create no visitor session.
Successful submissions return:

```json
{
  "accepted": true,
  "visitor_session_created": true
}
```

Use `POST get-visitor-visit` with `{ "token": "..." }` to obtain the minimal
visit-page state. The response contains the lifecycle status, display names,
organization and branch names, admission and departure times, and
`self_checkout_available: false`. It does not expose visitor contact details,
internal IDs, or token hashes.

Credentials expire after 24 hours and are revoked when a visit is declined,
cancelled, checked out, auto-closed, or administratively closed. Expired,
revoked, malformed, and unknown credentials all return a generic unavailable
response. Store the token in tab-scoped session storage in the later frontend,
never in a URL or persistent shared-tablet storage, and clear it when the
visitor finishes using a shared device.

## Maintenance and rollout

The `tgm-visitor-session-cleanup` Cron job removes expired sessions daily and
revoked sessions after one day. Apply the database migration and deploy both
updated public functions together. Regenerate public database types after the
migration. Organization signup remains disabled until its separate frontend
and rollout checks are complete.
