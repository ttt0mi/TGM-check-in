-- Operator-only, atomic visit lifecycle operations. Edge Functions authenticate
-- the JWT; this RPC independently checks the live operator assignment.
create function public.tgm_operator_visit_action(
  p_actor_id uuid, p_visit_id uuid, p_action text, p_patch jsonb default '{}'::jsonb
)
returns public.visits language plpgsql security definer set search_path = '' as $$
declare visit_row public.visits%rowtype;
declare actor public.operator_profiles%rowtype;
declare event_name text;
begin
  select * into actor from public.operator_profiles where user_id = p_actor_id and is_active;
  if actor.user_id is null then raise exception 'Operator access denied'; end if;
  select * into visit_row from public.visits where id = p_visit_id for update;
  if visit_row.id is null then raise exception 'Visit not found'; end if;
  if actor.role = 'receptionist' and not exists (
    select 1 from public.receptionist_location_assignments a
    join public.locations l on l.id = a.location_id and l.is_active
    where a.user_id = p_actor_id and a.location_id = visit_row.location_id
  ) then raise exception 'Location access denied'; end if;
  if actor.role not in ('admin', 'receptionist') then raise exception 'Operator access denied'; end if;

  if p_action = 'edit' then
    if visit_row.status not in ('pending_reception_review', 'pending_host_acknowledgement',
      'host_approved_awaiting_reception') then raise exception 'This visit cannot be edited'; end if;
    if jsonb_typeof(p_patch) <> 'object' or exists (
      select 1 from jsonb_object_keys(p_patch) as k(name)
      where name not in ('visitor_full_name', 'visitor_preferred_name', 'visitor_email',
        'phone_number', 'organization', 'visit_type', 'purpose', 'department_id', 'staff_id')
    ) then raise exception 'Invalid visit changes'; end if;
    if visit_row.status <> 'pending_reception_review' and
      (p_patch ? 'department_id' or p_patch ? 'staff_id') then
      raise exception 'Host and department are fixed after review';
    end if;
    update public.visits set
      visitor_full_name = case when p_patch ? 'visitor_full_name' then p_patch->>'visitor_full_name' else visitor_full_name end,
      visitor_preferred_name = case when p_patch ? 'visitor_preferred_name' then p_patch->>'visitor_preferred_name' else visitor_preferred_name end,
      visitor_email = case when p_patch ? 'visitor_email' then p_patch->>'visitor_email' else visitor_email end,
      phone_number = case when p_patch ? 'phone_number' then p_patch->>'phone_number' else phone_number end,
      organization = case when p_patch ? 'organization' then p_patch->>'organization' else organization end,
      visit_type = case when p_patch ? 'visit_type' then (p_patch->>'visit_type')::public.tgm_visit_type else visit_type end,
      purpose = case when p_patch ? 'purpose' then p_patch->>'purpose' else purpose end,
      department_id = case when p_patch ? 'department_id' then (p_patch->>'department_id')::uuid else department_id end,
      staff_id = case when p_patch ? 'staff_id' then (p_patch->>'staff_id')::uuid else staff_id end
      where id = p_visit_id returning * into visit_row;
    return visit_row;
  end if;

  if p_patch <> '{}'::jsonb then raise exception 'Unexpected visit changes'; end if;
  if p_action = 'review' and visit_row.status = 'pending_reception_review' and visit_row.staff_id is not null then
    update public.visits set status = 'pending_host_acknowledgement', reception_reviewed_at = now()
      where id = p_visit_id returning * into visit_row;
    event_name := 'reception_approved';
  elsif p_action = 'admit' and (
    (visit_row.status = 'pending_reception_review' and visit_row.staff_id is null)
    or visit_row.status = 'host_approved_awaiting_reception'
  ) then
    update public.visits set status = 'approved_on_site', admitted_at = now(),
      reception_reviewed_at = coalesce(reception_reviewed_at, now())
      where id = p_visit_id returning * into visit_row;
    event_name := 'admitted';
  elsif p_action = 'checkout' and visit_row.status = 'approved_on_site' then
    update public.visits set status = 'checked_out', time_out = now()
      where id = p_visit_id returning * into visit_row;
    event_name := 'checked_out';
  elsif p_action = 'cancel' and visit_row.status in ('pending_reception_review',
    'pending_host_acknowledgement', 'host_approved_awaiting_reception') then
    update public.visits set status = 'cancelled' where id = p_visit_id returning * into visit_row;
    event_name := 'cancelled';
  else
    raise exception 'Invalid visit action for current status';
  end if;
  insert into public.visit_events (visit_id, event_type, event_source)
    values (p_visit_id, event_name, 'reception');
  return visit_row;
end;
$$;
revoke all on function public.tgm_operator_visit_action(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.tgm_operator_visit_action(uuid,uuid,text,jsonb) to service_role;

-- The host link expires at the next midnight in the visit's IANA timezone.
create function tgm_private.set_host_token_expiry()
returns trigger language plpgsql set search_path = '' as $$
declare visit_time timestamptz;
declare zone_name text;
begin
  select v.arrived_at, l.timezone into visit_time, zone_name
  from public.visits v join public.locations l on l.id = v.location_id
  where v.id = new.visit_id;
  new.expires_at := (((visit_time at time zone zone_name)::date + 1)::timestamp at time zone zone_name);
  if new.expires_at <= now() then raise exception 'The visit day has ended'; end if;
  return new;
end;
$$;
create trigger host_tokens_set_expiry before insert on public.host_decision_tokens
  for each row execute function tgm_private.set_host_token_expiry();
