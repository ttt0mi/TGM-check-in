-- Harden the new backend and close the prototype registration entry point.
do $$
begin
  if to_regprocedure('public.register_visitor_by_qr(uuid,text,text,text,text,text,text,text,text)') is not null then
    revoke execute on function public.register_visitor_by_qr(uuid,text,text,text,text,text,text,text,text)
      from public, anon, authenticated;
  end if;
end;
$$;

-- Registration never grants privileges. The first admin is provisioned by a
-- database owner after verifying the account, as described in the README.
create or replace function tgm_private.register_operator_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.operator_profiles (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop table if exists tgm_private.admin_bootstrap;

create or replace function public.tgm_manage_operator(
  p_actor_id uuid, p_target_id uuid, p_action text,
  p_role public.tgm_operator_role default null, p_location_id uuid default null
)
returns public.operator_profiles language plpgsql security definer set search_path = '' as $$
declare result_row public.operator_profiles%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(59183472);
  if not exists (select 1 from public.operator_profiles
    where user_id = p_actor_id and role = 'admin' and is_active) then
    raise exception 'Admin access required';
  end if;
  if not exists (select 1 from auth.users where id = p_target_id and email_confirmed_at is not null) then
    raise exception 'Target must have a verified account';
  end if;
  if p_action = 'deactivate' then
    if p_actor_id = p_target_id then raise exception 'An admin cannot deactivate themselves'; end if;
    update public.operator_profiles set is_active = false where user_id = p_target_id returning * into result_row;
  elsif p_action = 'assign' then
    if p_actor_id = p_target_id and p_role <> 'admin' then
      raise exception 'An admin cannot remove their own admin role';
    end if;
    if p_role is null or (p_role = 'receptionist' and p_location_id is null)
      or (p_role = 'admin' and p_location_id is not null) then
      raise exception 'Role and location do not match';
    end if;
    if p_role = 'receptionist' and not exists (
      select 1 from public.locations where id = p_location_id and is_active
    ) then raise exception 'Reception location unavailable'; end if;
    update public.operator_profiles set role = p_role, is_active = false
      where user_id = p_target_id returning * into result_row;
    if result_row.user_id is null then raise exception 'Operator profile missing'; end if;
    delete from public.receptionist_location_assignments where user_id = p_target_id;
    if p_role = 'receptionist' then
      insert into public.receptionist_location_assignments (user_id, location_id)
        values (p_target_id, p_location_id);
    end if;
    update public.operator_profiles set is_active = true
      where user_id = p_target_id returning * into result_row;
  else
    raise exception 'Invalid operator action';
  end if;
  if result_row.user_id is null then raise exception 'Operator profile missing'; end if;
  return result_row;
end;
$$;

-- A notification and a visit edit both lock the visit row. Once notification
-- starts, the details in the message cannot diverge from the host decision.
create function tgm_private.protect_notified_visit_details()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.visitor_full_name is distinct from old.visitor_full_name
      or new.visit_type is distinct from old.visit_type
      or new.purpose is distinct from old.purpose)
    and exists (select 1 from public.host_notification_attempts
      where visit_id = old.id and status in ('sending', 'sent', 'unknown')) then
    raise exception 'Host-visible details cannot change after notification starts';
  end if;
  return new;
end;
$$;
create trigger visits_protect_notified_details before update on public.visits
  for each row execute function tgm_private.protect_notified_visit_details();

-- A terminated worker cannot finalize its attempt. Mark stale attempts as
-- unknown, never failed: the provider may already have accepted the message.
create function public.tgm_mark_stale_host_email(p_actor_id uuid, p_visit_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare updated_count integer;
begin
  if not exists (
    select 1 from public.visits v
    join public.operator_profiles p on p.user_id = p_actor_id and p.is_active
    left join public.receptionist_location_assignments a on a.user_id = p.user_id
    left join public.locations l on l.id = a.location_id
    where v.id = p_visit_id and (p.role = 'admin' or
      (p.role = 'receptionist' and a.location_id = v.location_id and l.is_active))
  ) then raise exception 'Location access denied'; end if;
  update public.host_notification_attempts
    set status = 'unknown', error_code = 'stale_sending_outcome_unknown'
    where visit_id = p_visit_id and status = 'sending'
      and attempted_at < now() - interval '10 minutes';
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
revoke all on function public.tgm_mark_stale_host_email(uuid,uuid) from public, anon, authenticated;
grant execute on function public.tgm_mark_stale_host_email(uuid,uuid) to service_role;

-- Serialize creation with location deactivation, and retain reception access
-- to visits that have not yet reached a terminal status.
create function tgm_private.lock_active_visit_location()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.location_id is distinct from old.location_id then
    perform 1 from public.locations where id = new.location_id and is_active for share;
    if not found then raise exception 'Visit location is inactive or unavailable'; end if;
  end if;
  return new;
end;
$$;
create trigger visits_lock_active_location before insert or update on public.visits
  for each row execute function tgm_private.lock_active_visit_location();

create function tgm_private.protect_active_location_visits()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.visits where location_id = old.id and status in
      ('pending_reception_review', 'pending_host_acknowledgement',
       'host_approved_awaiting_reception', 'approved_on_site')
  ) then raise exception 'Close or cancel active visits before deactivating this location'; end if;
  return new;
end;
$$;
create trigger locations_protect_active_visits before update of is_active on public.locations
  for each row execute function tgm_private.protect_active_location_visits();

create table tgm_private.assisted_submission_keys (
  idempotency_key uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  request_hash bytea not null check (octet_length(request_hash) = 32)
);
revoke all on tgm_private.assisted_submission_keys from public, anon, authenticated;

drop function public.tgm_create_assisted_visit(
  uuid,uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text
);
create function public.tgm_create_assisted_visit(
  p_actor_id uuid, p_location_id uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  visit_id_value uuid;
  existing_actor uuid;
  existing_hash bytea;
  input_hash bytea;
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if not exists (
    select 1 from public.operator_profiles p
    left join public.receptionist_location_assignments a on a.user_id = p.user_id
    join public.locations l on l.id = p_location_id and l.is_active
    where p.user_id = p_actor_id and p.is_active
      and (p.role = 'admin' or (p.role = 'receptionist' and a.location_id = p_location_id))
  ) then raise exception 'Location access denied'; end if;
  input_hash := pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(
    p_location_id, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    p_phone_number, nullif(btrim(p_organization), ''), p_visit_type, btrim(p_purpose)
  )::text, 'UTF8'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select k.visit_id, k.actor_id, k.request_hash into visit_id_value, existing_actor, existing_hash
    from tgm_private.assisted_submission_keys k where k.idempotency_key = p_idempotency_key;
  if visit_id_value is not null then
    if existing_actor <> p_actor_id or existing_hash <> input_hash then
      raise exception 'Idempotency key already used for a different request';
    end if;
    return visit_id_value;
  end if;
  insert into public.visits (
    location_id, department_id, staff_id, visitor_full_name,
    visitor_preferred_name, visitor_email, phone_number, organization,
    visit_type, purpose, check_in_method
  ) values (
    p_location_id, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    p_phone_number, nullif(btrim(p_organization), ''), p_visit_type,
    btrim(p_purpose), 'assisted'
  ) returning id into visit_id_value;
  insert into tgm_private.assisted_submission_keys (idempotency_key, actor_id, visit_id, request_hash)
    values (p_idempotency_key, p_actor_id, visit_id_value, input_hash);
  insert into public.visit_events (visit_id, event_type, event_source)
    values (visit_id_value, 'created', 'reception');
  return visit_id_value;
end;
$$;
revoke all on function public.tgm_create_assisted_visit(
  uuid,uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) from public, anon, authenticated;
grant execute on function public.tgm_create_assisted_visit(
  uuid,uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) to service_role;

-- Remove prototype tables and functions. Review before applying this migration
-- to any database containing data that must be retained.
drop function if exists public.create_self_checkout_challenge(uuid,text,uuid,text);
drop function if exists public.verify_self_checkout_code(uuid,text);
drop function if exists public.register_visitor_by_qr(uuid,text,text,text,text,text,text,text,text);
drop function if exists public.get_reception_hosts_by_qr(uuid);
drop function if exists public.get_reception_company_by_qr(uuid);
drop function if exists public.get_my_reception_access();
drop function if exists public.get_or_create_reception_workspace();
drop function if exists public.list_reception_team();
drop table if exists public.self_checkout_challenges;
drop table if exists public.guests;
drop table if exists public.employee_hosts;
drop table if exists public.workspace_reception_members;
drop table if exists public.workspaces;
drop function if exists public.protect_reception_guest_inserts();
drop function if exists public.protect_reception_guest_updates();
drop function if exists public.is_reception_member(uuid);
