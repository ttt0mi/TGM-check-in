-- Visit lifecycle accountability and temporary QR visitor sessions.
create type public.tgm_checkout_method as enum (
  'self',
  'receptionist_assisted',
  'system_auto_close',
  'admin_correction'
);

alter table public.visits
  add column checkout_method public.tgm_checkout_method,
  add column checkout_location_id uuid,
  add column checkout_actor_id uuid,
  add column checkout_corrected_at timestamptz,
  add column checkout_corrected_by uuid,
  add column checkout_correction_reason text;

-- Existing explicit checkout operations were receptionist actions. Existing
-- actor identities cannot be recovered safely from historical rows.
update public.visits
set checkout_method = case status
      when 'checked_out' then 'receptionist_assisted'::public.tgm_checkout_method
      when 'auto_closed' then 'system_auto_close'::public.tgm_checkout_method
    end,
    checkout_location_id = location_id
where status in ('checked_out', 'auto_closed');

alter table public.visits
  add constraint visits_checkout_location_organization_fk
    foreign key (checkout_location_id, organization_id)
    references public.locations(id, organization_id) on delete restrict,
  add constraint visits_checkout_actor_organization_fk
    foreign key (checkout_actor_id, organization_id)
    references public.operator_profiles(user_id, organization_id) on delete restrict,
  add constraint visits_checkout_corrector_organization_fk
    foreign key (checkout_corrected_by, organization_id)
    references public.operator_profiles(user_id, organization_id) on delete restrict,
  add constraint visits_checkout_location_matches_checkin
    check (checkout_location_id is null or checkout_location_id = location_id),
  add constraint visits_checkout_provenance_complete
    check (
      (status in ('checked_out', 'auto_closed')
        and time_out is not null
        and checkout_method is not null
        and checkout_location_id is not null)
      or
      (status not in ('checked_out', 'auto_closed')
        and time_out is null
        and checkout_method is null
        and checkout_location_id is null
        and checkout_actor_id is null)
    ),
  add constraint visits_auto_close_method_matches
    check (status <> 'auto_closed' or checkout_method = 'system_auto_close'),
  add constraint visits_checkout_correction_complete
    check (
      (checkout_corrected_at is null
        and checkout_corrected_by is null
        and checkout_correction_reason is null)
      or
      (checkout_corrected_at is not null
        and checkout_corrected_by is not null
        and checkout_correction_reason is not null
        and char_length(btrim(checkout_correction_reason)) between 1 and 500)
    );

create index visits_checkout_reporting_idx
  on public.visits (organization_id, checkout_location_id, time_out desc)
  where time_out is not null;
create index visits_checkout_actor_idx
  on public.visits (checkout_actor_id, organization_id, time_out desc);
create index visits_checkout_corrector_idx
  on public.visits (checkout_corrected_by, organization_id, checkout_corrected_at desc);
create index visits_checkout_location_organization_idx
  on public.visits (checkout_location_id, organization_id);

alter table public.visit_events
  add column organization_id uuid,
  add column location_id uuid,
  add column actor_user_id uuid,
  add column actor_role public.tgm_operator_role;

update public.visit_events e
set organization_id = v.organization_id,
    location_id = v.location_id
from public.visits v
where v.id = e.visit_id;

alter table public.visit_events
  alter column organization_id set not null,
  alter column location_id set not null,
  add constraint visit_events_visit_organization_fk
    foreign key (visit_id, organization_id)
    references public.visits(id, organization_id) on delete cascade,
  add constraint visit_events_location_organization_fk
    foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete restrict,
  add constraint visit_events_actor_organization_fk
    foreign key (actor_user_id, organization_id)
    references public.operator_profiles(user_id, organization_id) on delete restrict,
  add constraint visit_events_actor_role_pair
    check ((actor_user_id is null) = (actor_role is null));

alter table public.visit_events drop constraint visit_events_event_type_check;
alter table public.visit_events add constraint visit_events_event_type_check
  check (event_type in (
    'created', 'reception_approved', 'host_email_sent', 'host_email_failed',
    'host_approved', 'host_declined', 'admitted', 'checked_out',
    'checkout_corrected', 'cancelled', 'auto_closed'
  ));
alter table public.visit_events drop constraint visit_events_event_source_check;
alter table public.visit_events add constraint visit_events_event_source_check
  check (event_source in ('public_form', 'reception', 'host_link', 'system', 'admin'));
alter table public.visit_events add constraint visit_events_admin_actor
  check (event_source <> 'admin' or (actor_user_id is not null and actor_role = 'admin'));
alter table public.visit_events add constraint visit_events_non_operator_has_no_actor
  check (event_source not in ('public_form', 'host_link', 'system')
    or (actor_user_id is null and actor_role is null));

create index visit_events_actor_time_idx
  on public.visit_events (actor_user_id, organization_id, occurred_at desc);
create index visit_events_organization_location_time_idx
  on public.visit_events (organization_id, location_id, occurred_at desc);
create index visit_events_location_organization_idx
  on public.visit_events (location_id, organization_id);
create index visit_events_visit_organization_idx
  on public.visit_events (visit_id, organization_id);

create function tgm_private.populate_visit_event_context()
returns trigger language plpgsql set search_path = '' as $$
declare visit_organization uuid;
declare visit_location uuid;
declare current_actor_role public.tgm_operator_role;
begin
  select v.organization_id, v.location_id
    into visit_organization, visit_location
  from public.visits v where v.id = new.visit_id;
  if visit_organization is null then raise exception 'Visit not found'; end if;
  if new.organization_id is null then new.organization_id := visit_organization; end if;
  if new.location_id is null then new.location_id := visit_location; end if;
  if new.organization_id <> visit_organization or new.location_id <> visit_location then
    raise exception 'Visit event tenant or branch mismatch';
  end if;
  if new.actor_user_id is not null then
    select p.role into current_actor_role
    from public.operator_profiles p
    where p.user_id = new.actor_user_id
      and p.organization_id = visit_organization
      and p.is_active;
    if current_actor_role is null then raise exception 'Active operator actor required'; end if;
    if new.actor_role is null then new.actor_role := current_actor_role; end if;
    if new.actor_role <> current_actor_role then raise exception 'Operator role mismatch'; end if;
  elsif new.actor_role is not null then
    raise exception 'Operator role requires an actor';
  end if;
  return new;
end;
$$;
create trigger visit_events_populate_context
  before insert on public.visit_events
  for each row execute function tgm_private.populate_visit_event_context();

create function tgm_private.prevent_visit_event_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Visit events are append-only';
end;
$$;
create trigger visit_events_append_only
  before update on public.visit_events
  for each row execute function tgm_private.prevent_visit_event_update();

create table tgm_private.visitor_sessions (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  visit_id uuid not null unique,
  organization_id uuid not null,
  location_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz,
  foreign key (visit_id, organization_id)
    references public.visits(id, organization_id) on delete cascade,
  foreign key (location_id, organization_id)
    references public.locations(id, organization_id) on delete restrict,
  check (expires_at > issued_at),
  check (revoked_at is null or revoked_at >= issued_at)
);
create index visitor_sessions_expiry_idx
  on tgm_private.visitor_sessions (expires_at)
  where revoked_at is null;
create index visitor_sessions_revoked_idx
  on tgm_private.visitor_sessions (revoked_at)
  where revoked_at is not null;
create index visitor_sessions_visit_organization_idx
  on tgm_private.visitor_sessions (visit_id, organization_id);
create index visitor_sessions_location_organization_idx
  on tgm_private.visitor_sessions (location_id, organization_id);
revoke all on tgm_private.visitor_sessions from public, anon, authenticated, service_role;

alter table tgm_private.public_submission_keys
  add column visitor_session_token_hash bytea
    check (visitor_session_token_hash is null or octet_length(visitor_session_token_hash) = 32);

create function tgm_private.revoke_terminal_visitor_session()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('declined', 'cancelled', 'checked_out', 'auto_closed')
    and old.status is distinct from new.status then
    update tgm_private.visitor_sessions
      set revoked_at = coalesce(revoked_at, now())
      where visit_id = new.id;
  end if;
  return new;
end;
$$;
create trigger visits_revoke_terminal_session
  after update of status on public.visits
  for each row execute function tgm_private.revoke_terminal_visitor_session();

create or replace function public.tgm_operator_visit_action(
  p_actor_id uuid, p_visit_id uuid, p_action text, p_patch jsonb default '{}'::jsonb
) returns public.visits language plpgsql security definer set search_path = '' as $$
declare visit_row public.visits%rowtype;
declare actor_row public.operator_profiles%rowtype;
declare event_name text;
declare event_source text := 'reception';
declare event_metadata jsonb := '{}'::jsonb;
declare correction_reason text;
declare corrected_time timestamptz;
begin
  select * into visit_row from public.visits where id = p_visit_id for update;
  if visit_row.id is null then raise exception 'Visit not found'; end if;
  if not tgm_private.operator_can_access_location(p_actor_id, visit_row.location_id) then
    raise exception 'Location access denied';
  end if;
  select * into actor_row from public.operator_profiles
    where user_id = p_actor_id and organization_id = visit_row.organization_id and is_active;
  if actor_row.user_id is null then raise exception 'Operator access denied'; end if;

  if p_action = 'edit' then
    if visit_row.status not in ('pending_reception_review', 'pending_host_acknowledgement',
      'host_approved_awaiting_reception') then raise exception 'This visit cannot be edited'; end if;
    if p_patch is null or jsonb_typeof(p_patch) <> 'object' or exists (
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

  if p_action = 'correct_checkout' then
    if actor_row.role <> 'admin' then raise exception 'Admin access required'; end if;
    if p_patch is null or jsonb_typeof(p_patch) <> 'object'
      or not (p_patch ? 'reason') or exists (
        select 1 from jsonb_object_keys(p_patch) as k(name)
        where name not in ('reason', 'time_out')
      ) then raise exception 'Invalid checkout correction'; end if;
    correction_reason := btrim(p_patch->>'reason');
    if correction_reason is null or char_length(correction_reason) not between 1 and 500 then
      raise exception 'Checkout correction reason is required';
    end if;
    corrected_time := case when p_patch ? 'time_out'
      then (p_patch->>'time_out')::timestamptz else now() end;
    if corrected_time is null or corrected_time > now()
      or corrected_time < coalesce(visit_row.admitted_at, visit_row.arrived_at) then
      raise exception 'Invalid checkout time';
    end if;
    if visit_row.status = 'approved_on_site' then
      update public.visits set
        status = 'checked_out',
        time_out = corrected_time,
        checkout_method = 'admin_correction',
        checkout_location_id = location_id,
        checkout_actor_id = p_actor_id,
        checkout_corrected_at = now(),
        checkout_corrected_by = p_actor_id,
        checkout_correction_reason = correction_reason
      where id = p_visit_id returning * into visit_row;
      event_name := 'checked_out';
      event_source := 'admin';
      event_metadata := jsonb_build_object(
        'reason', correction_reason,
        'corrected_time_out', corrected_time,
        'checkout_method', 'admin_correction'
      );
    elsif visit_row.status in ('checked_out', 'auto_closed') then
      event_metadata := jsonb_build_object(
        'reason', correction_reason,
        'previous_time_out', visit_row.time_out,
        'corrected_time_out', corrected_time,
        'checkout_method', visit_row.checkout_method
      );
      update public.visits set
        time_out = corrected_time,
        checkout_corrected_at = now(),
        checkout_corrected_by = p_actor_id,
        checkout_correction_reason = correction_reason
      where id = p_visit_id returning * into visit_row;
      event_name := 'checkout_corrected';
      event_source := 'admin';
    else
      raise exception 'Invalid visit action for current status';
    end if;
    insert into public.visit_events
      (visit_id, event_type, event_source, actor_user_id, actor_role, metadata)
    values (p_visit_id, event_name, event_source, p_actor_id, actor_row.role, event_metadata);
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
    update public.visits set
      status = 'checked_out',
      time_out = now(),
      checkout_method = 'receptionist_assisted',
      checkout_location_id = location_id,
      checkout_actor_id = p_actor_id
      where id = p_visit_id returning * into visit_row;
    event_name := 'checked_out';
  elsif p_action = 'cancel' and visit_row.status in ('pending_reception_review',
    'pending_host_acknowledgement', 'host_approved_awaiting_reception') then
    update public.visits set status = 'cancelled' where id = p_visit_id returning * into visit_row;
    event_name := 'cancelled';
  else
    raise exception 'Invalid visit action for current status';
  end if;
  insert into public.visit_events
    (visit_id, event_type, event_source, actor_user_id, actor_role)
  values (p_visit_id, event_name, 'reception', p_actor_id, actor_row.role);
  return visit_row;
end;
$$;

create or replace function public.tgm_create_assisted_visit(
  p_actor_id uuid, p_location_id uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare visit_id_value uuid; existing_actor uuid; existing_hash bytea;
declare input_hash bytea; tenant_id uuid;
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if not tgm_private.operator_can_access_location(p_actor_id, p_location_id) then
    raise exception 'Location access denied';
  end if;
  select organization_id into tenant_id from public.locations where id = p_location_id and is_active;
  if tenant_id is null then raise exception 'Branch unavailable'; end if;
  input_hash := pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(
    p_location_id, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    p_phone_number, nullif(btrim(p_organization), ''), p_visit_type, btrim(p_purpose)
  )::text, 'UTF8'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select k.visit_id, k.actor_id, k.request_hash into visit_id_value, existing_actor, existing_hash
    from tgm_private.assisted_submission_keys k where k.idempotency_key = p_idempotency_key;
  if visit_id_value is not null then
    if existing_actor <> p_actor_id or existing_hash <> input_hash or not exists (
      select 1 from public.visits v where v.id = visit_id_value and v.organization_id = tenant_id
    ) then raise exception 'Idempotency key already used for a different request'; end if;
    return visit_id_value;
  end if;
  insert into public.visits (
    organization_id, location_id, department_id, staff_id, visitor_full_name,
    visitor_preferred_name, visitor_email, phone_number, organization,
    visit_type, purpose, check_in_method
  ) values (
    tenant_id, p_location_id, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    p_phone_number, nullif(btrim(p_organization), ''), p_visit_type,
    btrim(p_purpose), 'assisted'
  ) returning id into visit_id_value;
  insert into tgm_private.assisted_submission_keys (idempotency_key, actor_id, visit_id, request_hash)
    values (p_idempotency_key, p_actor_id, visit_id_value, input_hash);
  insert into public.visit_events (visit_id, event_type, event_source, actor_user_id)
    values (visit_id_value, 'created', 'reception', p_actor_id);
  return visit_id_value;
end;
$$;

create or replace function public.tgm_apply_auto_close(p_limit integer default 200)
returns integer language plpgsql security definer set search_path = '' as $$
declare closed_count integer;
begin
  if p_limit not between 1 and 1000 then raise exception 'Invalid batch size'; end if;
  with eligible as (
    select v.id from public.visits v
    join public.locations l on l.id = v.location_id
    where v.status = 'approved_on_site' and l.auto_close_enabled
      and (now() at time zone l.timezone)::time >= l.auto_close_local_time
      and (
        (v.admitted_at at time zone l.timezone)::date < (now() at time zone l.timezone)::date
        or (v.admitted_at at time zone l.timezone)::time < l.auto_close_local_time
      )
    order by v.admitted_at, v.id limit p_limit for update of v skip locked
  ), closed as (
    update public.visits v set
      status = 'auto_closed',
      time_out = now(),
      checkout_method = 'system_auto_close',
      checkout_location_id = location_id,
      checkout_actor_id = null
    from eligible e where v.id = e.id returning v.id
  ), events as (
    insert into public.visit_events (visit_id, event_type, event_source)
      select id, 'auto_closed', 'system' from closed returning id
  )
  select count(*) into closed_count from events;
  return closed_count;
end;
$$;

drop function public.tgm_public_visit_retry_matches(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
);
create function public.tgm_public_visit_retry_matches(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid,
  p_visitor_session_token_hash bytea
) returns boolean language plpgsql security definer set search_path = '' as $$
declare existing_hash bytea;
declare existing_visit_id uuid;
declare existing_session_hash bytea;
begin
  if p_submission_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;
  if p_visitor_session_token_hash is not null
    and octet_length(p_visitor_session_token_hash) <> 32 then
    raise exception 'Invalid visitor session token hash';
  end if;
  select k.request_hash, k.visit_id, k.visitor_session_token_hash
    into existing_hash, existing_visit_id, existing_session_hash
  from tgm_private.public_submission_keys k
  where k.idempotency_key = p_submission_idempotency_key;
  if not found then return false; end if;
  if existing_hash <> tgm_private.public_submission_hash(
    p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
    p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
    p_visit_type, p_purpose
  ) or existing_session_hash is distinct from p_visitor_session_token_hash then
    raise sqlstate 'PT409' using message = 'Idempotency key already used for a different request';
  end if;
  if not exists (
    select 1 from public.visits v
    join public.locations l on l.id = v.location_id
      and l.organization_id = v.organization_id and l.is_active
    join public.organizations o on o.id = v.organization_id and o.is_active
    where v.id = existing_visit_id and l.public_slug = p_public_slug
  ) then raise exception 'Location unavailable'; end if;
  return true;
end;
$$;
revoke all on function public.tgm_public_visit_retry_matches(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid,bytea
) from public, anon, authenticated;
grant execute on function public.tgm_public_visit_retry_matches(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid,bytea
) to service_role;

-- Preserve the original privileged RPC signature for deployed callers that do
-- not create a visitor session.
create function public.tgm_public_visit_retry_matches(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid
) returns boolean language sql security definer set search_path = '' as $$
  select public.tgm_public_visit_retry_matches(
    p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
    p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
    p_visit_type, p_purpose, p_submission_idempotency_key, null::bytea
  );
$$;
revoke all on function public.tgm_public_visit_retry_matches(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) from public, anon, authenticated;
grant execute on function public.tgm_public_visit_retry_matches(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) to service_role;

drop function public.tgm_create_public_visit(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
);
create function public.tgm_create_public_visit(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid,
  p_visitor_session_token_hash bytea
) returns uuid language plpgsql security definer set search_path = '' as $$
declare location_id_value uuid; tenant_id uuid; visit_id_value uuid;
begin
  if p_submission_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if p_visitor_session_token_hash is not null
    and octet_length(p_visitor_session_token_hash) <> 32 then
    raise exception 'Invalid visitor session token hash';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_idempotency_key::text, 0));
  if public.tgm_public_visit_retry_matches(
    p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
    p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
    p_visit_type, p_purpose, p_submission_idempotency_key, p_visitor_session_token_hash
  ) then
    select k.visit_id into visit_id_value from tgm_private.public_submission_keys k
      where k.idempotency_key = p_submission_idempotency_key;
    return visit_id_value;
  end if;
  select l.id, l.organization_id into location_id_value, tenant_id from public.locations l
    join public.organizations o on o.id = l.organization_id and o.is_active
    where l.public_slug = p_public_slug and l.is_active;
  if location_id_value is null then raise exception 'Unknown or inactive location'; end if;
  insert into public.visits (
    organization_id, location_id, department_id, staff_id, visitor_full_name,
    visitor_preferred_name, visitor_email, phone_number, organization,
    visit_type, purpose, check_in_method, submission_idempotency_key
  ) values (
    tenant_id, location_id_value, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    btrim(p_phone_number), nullif(btrim(p_organization), ''), p_visit_type,
    btrim(p_purpose), 'qr', p_submission_idempotency_key
  ) returning id into visit_id_value;
  insert into tgm_private.public_submission_keys
    (idempotency_key, visit_id, request_hash, visitor_session_token_hash)
  values (
    p_submission_idempotency_key,
    visit_id_value,
    tgm_private.public_submission_hash(
      p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
      p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
      p_visit_type, p_purpose
    ),
    p_visitor_session_token_hash
  );
  if p_visitor_session_token_hash is not null then
    insert into tgm_private.visitor_sessions
      (token_hash, visit_id, organization_id, location_id)
    values (p_visitor_session_token_hash, visit_id_value, tenant_id, location_id_value);
  end if;
  insert into public.visit_events (visit_id, event_type, event_source)
    values (visit_id_value, 'created', 'public_form');
  return visit_id_value;
end;
$$;
revoke all on function public.tgm_create_public_visit(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid,bytea
) from public, anon, authenticated;
grant execute on function public.tgm_create_public_visit(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid,bytea
) to service_role;

create function public.tgm_create_public_visit(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid
) returns uuid language sql security definer set search_path = '' as $$
  select public.tgm_create_public_visit(
    p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
    p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
    p_visit_type, p_purpose, p_submission_idempotency_key, null::bytea
  );
$$;
revoke all on function public.tgm_create_public_visit(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) from public, anon, authenticated;
grant execute on function public.tgm_create_public_visit(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) to service_role;

create function public.tgm_get_visitor_visit(p_token_hash bytea)
returns table (
  status public.tgm_visit_status,
  visitor_display_name text,
  organization_name text,
  branch_name text,
  host_name text,
  admitted_at timestamptz,
  time_out timestamptz,
  self_checkout_available boolean
) language sql stable security definer set search_path = '' as $$
  select
    v.status,
    coalesce(nullif(btrim(v.visitor_preferred_name), ''), split_part(btrim(v.visitor_full_name), ' ', 1)),
    o.name,
    l.name,
    coalesce(nullif(btrim(s.preferred_name), ''), s.full_name),
    v.admitted_at,
    v.time_out,
    false
  from tgm_private.visitor_sessions vs
  join public.visits v on v.id = vs.visit_id and v.organization_id = vs.organization_id
  join public.organizations o on o.id = v.organization_id and o.is_active
  join public.locations l on l.id = v.location_id
    and l.organization_id = v.organization_id and l.is_active
  left join public.staff s on s.id = v.staff_id
    and s.organization_id = v.organization_id
    and s.location_id = v.location_id
    and s.department_id = v.department_id
  where vs.token_hash = p_token_hash
    and octet_length(p_token_hash) = 32
    and vs.revoked_at is null
    and vs.expires_at > now()
  limit 1;
$$;
revoke all on function public.tgm_get_visitor_visit(bytea) from public, anon, authenticated;
grant execute on function public.tgm_get_visitor_visit(bytea) to service_role;

create function tgm_private.purge_expired_visitor_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed_count integer;
begin
  if current_user <> 'postgres' then raise exception 'Database owner only'; end if;
  delete from tgm_private.visitor_sessions
  where expires_at <= now()
    or (revoked_at is not null and revoked_at < now() - interval '1 day');
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function tgm_private.purge_expired_visitor_sessions()
  from public, anon, authenticated, service_role;

select cron.schedule(
  'tgm-visitor-session-cleanup',
  '20 3 * * *',
  'select tgm_private.purge_expired_visitor_sessions()'
);
