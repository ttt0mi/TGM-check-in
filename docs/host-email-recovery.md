# Host email recovery

An attempt still marked `sending` after ten minutes is changed to `unknown` on
the next send request. An unknown result blocks automatic retries: the email
may already have been accepted, and a fresh token would invalidate its link.
An administrator must review the Resend request logs and the attempt before
deciding how to resolve it. Do not mark an ambiguous attempt failed unless the
provider confirms it was not accepted. Resend idempotency keys expire after
24 hours; retaining a key alone is not an indefinite duplicate guarantee.

If the provider confirms that an attempt was not accepted, a database owner can
set that specific attempt from `unknown` to `failed` in the SQL editor; the
next request can then create a new attempt. Replace the placeholder with the
verified attempt ID and inspect the returned row:

```sql
update public.host_notification_attempts
set status = 'failed', error_code = 'provider_confirmed_not_sent'
where id = '00000000-0000-0000-0000-000000000000'::uuid and status = 'unknown'
returning id, visit_id, status;
```

If the provider accepted the message, preserve the original token and do not
send a replacement merely because the result was unknown. After confirming the
provider message ID, a database owner can record that result:

```sql
with resolved as (
  update public.host_notification_attempts
  set status = 'sent', sent_at = now(), provider_message_id = 'replace-with-provider-message-id', error_code = null
  where id = '00000000-0000-0000-0000-000000000000'::uuid and status = 'unknown'
  returning visit_id
)
insert into public.visit_events (visit_id, event_type, event_source)
select visit_id, 'host_email_sent', 'reception' from resolved;
```
