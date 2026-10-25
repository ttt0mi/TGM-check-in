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

## Visitor status sessions for QR check-ins

The QR code only opens the public check-in page for a branch. It is not the
visitor session and does not contain the session secret. When the visitor
submits that page, the future frontend can create a random secret and send it
with the form. The database links a one-way hash of that secret to the newly
created visit.

While the visit remains active, that browser can present the secret to ask for
the current visit status without requiring the visitor to create an account.
The response is deliberately limited to the visitor's display name, the
organization and branch names, the host's display name, and relevant visit
times. The secret does not grant operator access, expose contact details,
verify the visitor's identity or location, or enable self checkout.

The token is bound to its first visit. An exact retry of the same check-in must
reuse both the idempotency key and token. A different check-in cannot reuse
that token, even after its 24-hour session expires and is deleted; the retained
submission record causes the backend to return HTTP 409 with
`Visitor session already has a visit`. The frontend must generate a fresh
random token and idempotency key for every legitimate new check-in.

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

The 24-hour lifetime begins when the check-in is created. Declined, cancelled,
checked-out, auto-closed, and administratively closed visits remain readable
until that expiry so the visitor can see the final outcome and departure time.
The session is read-only and `self_checkout_available` remains false after any
terminal status. Expired, malformed, and unknown credentials return the same
generic unavailable response. Store the token in tab-scoped session storage in
the later frontend, never in a URL or persistent shared-tablet storage, and
clear it when the visitor finishes using a shared device.

When geofenced self checkout is implemented, the backend must independently
confirm that the visit is still on site and that all location and face checks
pass. The frontend must disable the checkout button as soon as the visitor is
outside the permitted geofence. A completed visit must never expose another
visitor action through this session.

## Maintenance and rollout

The `tgm-visitor-session-cleanup` Cron job removes expired sessions daily.
Apply the database migration and deploy both updated public functions together.
Regenerate public database types after the migration. Organization signup
remains disabled until its separate frontend and rollout checks are complete.
