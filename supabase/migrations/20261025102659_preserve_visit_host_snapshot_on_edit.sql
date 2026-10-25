-- The action RPC assigns staff_id in its UPDATE even when the host is unchanged.
-- Keep the original display snapshot unless the host assignment actually changes.
create or replace function tgm_private.snapshot_visit_host()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.staff_id is not distinct from old.staff_id then
    return new;
  end if;
  if new.staff_id is null then
    new.host_display_name_at_assignment := null;
  else
    select coalesce(s.preferred_name, s.full_name) into new.host_display_name_at_assignment
    from public.staff s where s.id = new.staff_id;
  end if;
  return new;
end;
$$;
revoke all on function tgm_private.snapshot_visit_host() from public, anon, authenticated;
