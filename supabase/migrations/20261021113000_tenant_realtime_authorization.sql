-- Realtime authorizes private channel joins with a probe row in
-- realtime.messages. The probe need not set the message's private field;
-- channel privacy is enforced by the client's private channel config.
-- Keep the authorization scoped to the live operator's branch.
drop policy if exists tgm_location_broadcast_read on realtime.messages;
create policy tgm_location_broadcast_read on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and exists (
      select 1 from public.locations l
      where (select realtime.topic()) = 'tgm:location:' || l.id::text
        and (select tgm_private.can_access_location(l.id))
    )
  );
