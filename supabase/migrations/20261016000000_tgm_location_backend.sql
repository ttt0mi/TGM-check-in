-- Additive TGM location-based backend. The prototype tables and migrations are preserved.
-- This migration is intentionally safe for an empty TGM application dataset.

create schema if not exists tgm_private;
revoke all on schema tgm_private from public, anon, authenticated;

create type public.tgm_operator_role as enum ('admin', 'receptionist');
create type public.tgm_visit_type as enum ('school', 'business', 'counselling', 'travels', 'vendors', 'other');
create type public.tgm_check_in_method as enum ('qr', 'assisted');
create type public.tgm_visit_status as enum (
  'pending_reception_review',
  'pending_host_acknowledgement',
  'host_approved_awaiting_reception',
  'approved_on_site',
  'checked_out',
  'declined',
  'cancelled',
  'auto_closed'
);
create type public.tgm_notification_status as enum ('sending', 'sent', 'failed', 'unknown');

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  public_slug uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null default '' check (char_length(address) <= 240),
  timezone text not null default 'Africa/Lagos',
  is_active boolean not null default true,
  auto_close_enabled boolean not null default false,
  auto_close_local_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_close_needs_time check (not auto_close_enabled or auto_close_local_time is not null)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index departments_normalized_name_key on public.departments (lower(btrim(name)));

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  preferred_name text check (preferred_name is null or char_length(btrim(preferred_name)) between 1 and 80),
  email text not null check (char_length(email) <= 254 and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, location_id, department_id)
);
create unique index staff_active_email_key on public.staff (lower(btrim(email))) where is_active;
create index staff_public_directory_idx on public.staff (location_id, department_id, full_name) where is_active;
create index staff_department_idx on public.staff (department_id);

create table public.operator_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role public.tgm_operator_role,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_operator_has_role check (not is_active or role is not null)
);
create index operator_profiles_active_role_idx on public.operator_profiles (role, user_id) where is_active;

create table public.receptionist_location_assignments (
  user_id uuid primary key references public.operator_profiles(user_id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index receptionist_assignments_location_idx on public.receptionist_location_assignments (location_id);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  staff_id uuid,
  visitor_full_name text not null check (char_length(btrim(visitor_full_name)) between 1 and 120),
  visitor_preferred_name text check (visitor_preferred_name is null or char_length(btrim(visitor_preferred_name)) between 1 and 80),
  visitor_email text check (visitor_email is null or (char_length(visitor_email) <= 254 and visitor_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')),
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{1,14}$'),
  organization text check (organization is null or char_length(organization) <= 120),
  visit_type public.tgm_visit_type not null,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 500),
  check_in_method public.tgm_check_in_method not null,
  status public.tgm_visit_status not null default 'pending_reception_review',
  arrived_at timestamptz not null default now(),
  reception_reviewed_at timestamptz,
  host_approved_at timestamptz,
  admitted_at timestamptz,
  time_out timestamptz,
  submission_idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_id, location_id, department_id)
    references public.staff (id, location_id, department_id) on delete restrict,
  constraint host_requires_department check (staff_id is null or department_id is not null),
  constraint admission_after_arrival check (admitted_at is null or admitted_at >= arrived_at),
  constraint checkout_after_arrival check (time_out is null or time_out >= arrived_at),
  constraint checkout_after_admission check (time_out is null or admitted_at is null or time_out >= admitted_at),
  constraint checked_out_has_time_out check (status not in ('checked_out', 'auto_closed') or time_out is not null),
  constraint on_site_has_admission check (status <> 'approved_on_site' or (admitted_at is not null and time_out is null)),
  constraint pending_has_no_admission check (
    status not in ('pending_reception_review', 'pending_host_acknowledgement', 'host_approved_awaiting_reception')
    or (admitted_at is null and time_out is null)
  ),
  constraint qr_has_idempotency_key check (check_in_method <> 'qr' or submission_idempotency_key is not null)
);
create index visits_location_status_arrival_idx on public.visits (location_id, status, arrived_at desc);
create index visits_location_arrival_idx on public.visits (location_id, arrived_at desc);
create index visits_staff_arrival_idx on public.visits (staff_id, arrived_at desc) where staff_id is not null;
create index visits_department_arrival_idx on public.visits (department_id, arrived_at desc) where department_id is not null;
create index visits_arrived_retention_idx on public.visits (arrived_at, id);

create table public.visit_events (
  id bigint generated always as identity primary key,
  visit_id uuid not null references public.visits(id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'reception_approved', 'host_email_sent', 'host_email_failed',
    'host_approved', 'host_declined', 'admitted', 'checked_out', 'cancelled', 'auto_closed'
  )),
  event_source text not null check (event_source in ('public_form', 'reception', 'host_link', 'system')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 1024),
  occurred_at timestamptz not null default now()
);
create index visit_events_visit_time_idx on public.visit_events (visit_id, occurred_at desc);

create table public.host_notification_attempts (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  recipient_email text not null check (char_length(recipient_email) <= 254),
  idempotency_key uuid not null unique,
  provider_message_id text,
  status public.tgm_notification_status not null default 'sending',
  error_code text check (error_code is null or char_length(error_code) <= 80),
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint sent_attempt_has_time check (status <> 'sent' or sent_at is not null)
);
create index host_attempts_visit_time_idx on public.host_notification_attempts (visit_id, attempted_at desc);
create index host_attempts_status_time_idx on public.host_notification_attempts (status, attempted_at) where status in ('sending', 'failed', 'unknown');

create table public.host_decision_tokens (
  visit_id uuid primary key references public.visits(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  outcome text check (outcome is null or outcome in ('approved', 'declined')),
  created_at timestamptz not null default now(),
  constraint consumed_has_outcome check ((consumed_at is null) = (outcome is null))
);
create index host_tokens_expiry_idx on public.host_decision_tokens (expires_at) where consumed_at is null;

create table public.public_rate_limit_windows (
  request_key_hash bytea not null check (octet_length(request_key_hash) = 32),
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count between 1 and 100000),
  primary key (request_key_hash, window_start)
);
create index public_rate_windows_expiry_idx on public.public_rate_limit_windows (window_start);

create function tgm_private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function tgm_private.validate_location_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.public_slug is distinct from old.public_slug then
    raise exception 'Printed location QR identifiers cannot be changed';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone and name like '%/%') then
    raise exception 'Location timezone must be a valid IANA region name';
  end if;
  return new;
end;
$$;
create trigger locations_validate_timezone before insert or update on public.locations
  for each row execute function tgm_private.validate_location_timezone();

create function tgm_private.normalize_staff_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;
create trigger staff_normalize_email before insert or update of email on public.staff
  for each row execute function tgm_private.normalize_staff_email();

create function tgm_private.validate_receptionist_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.operator_profiles p
    where p.user_id = new.user_id and p.role = 'receptionist'
  ) then
    raise exception 'Only a receptionist can have a location assignment';
  end if;
  return new;
end;
$$;
create trigger assignments_validate_role before insert or update on public.receptionist_location_assignments
  for each row execute function tgm_private.validate_receptionist_assignment();

create function tgm_private.validate_visit_reference()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.visitor_email := nullif(lower(btrim(new.visitor_email)), '');
  if tg_op = 'UPDATE' and old.status <> 'pending_reception_review' and (
    new.location_id is distinct from old.location_id or
    new.department_id is distinct from old.department_id or
    new.staff_id is distinct from old.staff_id
  ) then
    raise exception 'Location, department and host are fixed after reception review';
  end if;
  if tg_op = 'INSERT' or new.location_id is distinct from old.location_id then
    if not exists (select 1 from public.locations l where l.id = new.location_id and l.is_active) then
      raise exception 'Visit location is inactive or unavailable';
    end if;
  end if;
  if new.department_id is not null and (
    tg_op = 'INSERT' or new.department_id is distinct from old.department_id
  ) and not exists (select 1 from public.departments d where d.id = new.department_id and d.is_active) then
    raise exception 'Visit department is inactive or unavailable';
  end if;
  if new.staff_id is not null and (
    tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id
    or new.location_id is distinct from old.location_id
    or new.department_id is distinct from old.department_id
  ) and not exists (
    select 1 from public.staff s
    where s.id = new.staff_id and s.location_id = new.location_id
      and s.department_id = new.department_id and s.is_active
  ) then
    raise exception 'Visit host is inactive or does not match location and department';
  end if;
  return new;
end;
$$;
create trigger visits_validate_reference before insert or update on public.visits
  for each row execute function tgm_private.validate_visit_reference();

create function tgm_private.validate_visit_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_reception_review' then
      raise exception 'New visits must await reception review';
    end if;
    return new;
  end if;
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'pending_reception_review' and new.status in ('pending_host_acknowledgement', 'approved_on_site', 'cancelled'))
    or (old.status = 'pending_host_acknowledgement' and new.status in ('host_approved_awaiting_reception', 'declined', 'cancelled'))
    or (old.status = 'host_approved_awaiting_reception' and new.status in ('approved_on_site', 'cancelled'))
    or (old.status = 'approved_on_site' and new.status in ('checked_out', 'auto_closed'))
  ) then
    raise exception 'Invalid visit status transition';
  end if;
  if new.status = 'pending_host_acknowledgement' and new.staff_id is null then
    raise exception 'A host is required for host acknowledgement';
  end if;
  if new.status = 'approved_on_site' and new.staff_id is not null and old.status <> 'host_approved_awaiting_reception' then
    raise exception 'A named host must approve before admission';
  end if;
  return new;
end;
$$;
create trigger visits_validate_transition before insert or update of status on public.visits
  for each row execute function tgm_private.validate_visit_transition();

create trigger locations_updated_at before update on public.locations for each row execute function tgm_private.set_updated_at();
create trigger departments_updated_at before update on public.departments for each row execute function tgm_private.set_updated_at();
create trigger staff_updated_at before update on public.staff for each row execute function tgm_private.set_updated_at();
create trigger operator_profiles_updated_at before update on public.operator_profiles for each row execute function tgm_private.set_updated_at();
create trigger receptionist_assignments_updated_at before update on public.receptionist_location_assignments for each row execute function tgm_private.set_updated_at();
create trigger visits_updated_at before update on public.visits for each row execute function tgm_private.set_updated_at();
create trigger host_attempts_updated_at before update on public.host_notification_attempts for each row execute function tgm_private.set_updated_at();

-- Public registration creates an inactive, unassigned profile. Only the verified
-- designated first admin can consume the one-time bootstrap claim.
create table tgm_private.admin_bootstrap (
  singleton boolean primary key default true check (singleton),
  email text not null,
  claimed_by uuid unique references auth.users(id) on delete restrict,
  claimed_at timestamptz
);
insert into tgm_private.admin_bootstrap (email) values ('tonmide96@gmail.com');

create function tgm_private.register_operator_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare was_claimed boolean;
begin
  insert into public.operator_profiles (user_id) values (new.id)
    on conflict (user_id) do nothing;
  if new.email_confirmed_at is not null and lower(new.email) = 'tonmide96@gmail.com' then
    update tgm_private.admin_bootstrap
      set claimed_by = new.id, claimed_at = now()
      where singleton and claimed_by is null and lower(email) = lower(new.email);
    was_claimed := found;
    if was_claimed then
      update public.operator_profiles set role = 'admin', is_active = true where user_id = new.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger tgm_register_operator after insert or update of email_confirmed_at on auth.users
  for each row execute function tgm_private.register_operator_profile();

-- Backfill accounts created before this migration, while keeping all other sign-ups unassigned.
insert into public.operator_profiles (user_id)
select id from auth.users on conflict (user_id) do nothing;
with first_admin as (
  select id from auth.users
  where lower(email) = 'tonmide96@gmail.com' and email_confirmed_at is not null
  order by created_at limit 1
), claim as (
  update tgm_private.admin_bootstrap b set claimed_by = f.id, claimed_at = now()
  from first_admin f where b.singleton and b.claimed_by is null
  returning f.id
)
update public.operator_profiles p set role = 'admin', is_active = true
where p.user_id in (select id from claim);

create function tgm_private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.operator_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'admin' and p.is_active
  );
$$;
create function tgm_private.can_access_location(p_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.operator_profiles p
    left join public.receptionist_location_assignments a on a.user_id = p.user_id
    where p.user_id = (select auth.uid()) and p.is_active
      and (p.role = 'admin' or (p.role = 'receptionist' and a.location_id = p_location_id
        and exists (select 1 from public.locations l where l.id = p_location_id and l.is_active)))
  );
$$;
revoke all on function tgm_private.is_admin() from public, anon;
revoke all on function tgm_private.can_access_location(uuid) from public, anon;
grant usage on schema tgm_private to authenticated;
grant execute on function tgm_private.is_admin() to authenticated;
grant execute on function tgm_private.can_access_location(uuid) to authenticated;

alter table public.locations enable row level security;
alter table public.departments enable row level security;
alter table public.staff enable row level security;
alter table public.operator_profiles enable row level security;
alter table public.receptionist_location_assignments enable row level security;
alter table public.visits enable row level security;
alter table public.visit_events enable row level security;
alter table public.host_notification_attempts enable row level security;
alter table public.host_decision_tokens enable row level security;
alter table public.public_rate_limit_windows enable row level security;

revoke all on public.locations, public.departments, public.staff,
  public.operator_profiles, public.receptionist_location_assignments,
  public.visits, public.visit_events, public.host_notification_attempts,
  public.host_decision_tokens, public.public_rate_limit_windows from anon, authenticated;
grant select, insert, update on public.locations, public.departments, public.staff to authenticated;
grant select on public.operator_profiles, public.receptionist_location_assignments,
  public.visits, public.visit_events, public.host_notification_attempts to authenticated;

create policy locations_read on public.locations for select to authenticated
  using ((select tgm_private.can_access_location(id)));
create policy locations_insert on public.locations for insert to authenticated
  with check ((select tgm_private.is_admin()));
create policy locations_update on public.locations for update to authenticated
  using ((select tgm_private.is_admin())) with check ((select tgm_private.is_admin()));
create policy departments_read on public.departments for select to authenticated
  using ((select tgm_private.is_admin()) or exists (
    select 1 from public.staff s where s.department_id = departments.id
      and (select tgm_private.can_access_location(s.location_id))
  ));
create policy departments_insert on public.departments for insert to authenticated
  with check ((select tgm_private.is_admin()));
create policy departments_update on public.departments for update to authenticated
  using ((select tgm_private.is_admin())) with check ((select tgm_private.is_admin()));
create policy staff_read on public.staff for select to authenticated
  using ((select tgm_private.can_access_location(location_id)));
create policy staff_insert on public.staff for insert to authenticated
  with check ((select tgm_private.is_admin()));
create policy staff_update on public.staff for update to authenticated
  using ((select tgm_private.is_admin())) with check ((select tgm_private.is_admin()));
create policy operator_profiles_read on public.operator_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select tgm_private.is_admin()));
create policy assignments_read on public.receptionist_location_assignments for select to authenticated
  using (user_id = (select auth.uid()) or (select tgm_private.is_admin()));
create policy visits_read on public.visits for select to authenticated
  using ((select tgm_private.can_access_location(location_id)));
create policy visit_events_read on public.visit_events for select to authenticated
  using (exists (
    select 1 from public.visits v where v.id = visit_events.visit_id
      and (select tgm_private.can_access_location(v.location_id))
  ));
create policy host_attempts_read on public.host_notification_attempts for select to authenticated
  using (exists (
    select 1 from public.visits v where v.id = host_notification_attempts.visit_id
      and (select tgm_private.can_access_location(v.location_id))
  ));

-- Realtime messages already have RLS enabled. The client may subscribe to a
-- location's private channel, but cannot publish arbitrary dashboard events.
create policy tgm_location_broadcast_read on realtime.messages for select to authenticated
  using (private and extension = 'broadcast' and exists (
    select 1 from public.locations l
    where realtime.topic() = 'tgm:location:' || l.id::text
      and (select tgm_private.can_access_location(l.id))
  ));

create function tgm_private.broadcast_visit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('visit_id', new.id, 'location_id', new.location_id,
      'status', new.status, 'version', new.updated_at),
    'visit_changed', 'tgm:location:' || new.location_id::text, true
  );
  return new;
end;
$$;
create trigger visits_broadcast_change after insert or update on public.visits
  for each row execute function tgm_private.broadcast_visit_change();

-- Server-only RPCs keep multi-row lifecycle changes atomic. Edge Functions must
-- verify Turnstile and the operator JWT before calling the corresponding RPC.
create function public.tgm_consume_public_rate_limit(
  p_request_key_hash bytea, p_window_start timestamptz, p_limit integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare used_count integer;
begin
  if octet_length(p_request_key_hash) <> 32 or p_limit not between 1 and 1000
    or p_window_start < now() - interval '10 minutes'
    or p_window_start > now() + interval '1 minute' then
    raise exception 'Invalid rate limit input';
  end if;
  insert into public.public_rate_limit_windows (request_key_hash, window_start)
    values (p_request_key_hash, p_window_start)
    on conflict (request_key_hash, window_start)
    do update set request_count = public.public_rate_limit_windows.request_count + 1
    returning request_count into used_count;
  return used_count <= p_limit;
end;
$$;

create function public.tgm_create_public_visit(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text,
  p_submission_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare location_id_value uuid; visit_id_value uuid;
begin
  select id into location_id_value from public.locations
  where public_slug = p_public_slug and is_active;
  if location_id_value is null then raise exception 'Unknown or inactive location'; end if;
  insert into public.visits (
    location_id, department_id, staff_id, visitor_full_name,
    visitor_preferred_name, visitor_email, phone_number, organization,
    visit_type, purpose, check_in_method, submission_idempotency_key
  ) values (
    location_id_value, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    p_phone_number, nullif(btrim(p_organization), ''), p_visit_type,
    btrim(p_purpose), 'qr', p_submission_idempotency_key
  ) on conflict (submission_idempotency_key) do nothing
  returning id into visit_id_value;
  if visit_id_value is null then
    select id into visit_id_value from public.visits
      where submission_idempotency_key = p_submission_idempotency_key;
    return visit_id_value;
  end if;
  insert into public.visit_events (visit_id, event_type, event_source)
    values (visit_id_value, 'created', 'public_form');
  return visit_id_value;
end;
$$;

create function public.tgm_respond_to_host(p_token_hash bytea, p_outcome text)
returns text language plpgsql security definer set search_path = '' as $$
declare token_row public.host_decision_tokens%rowtype;
declare visit_row public.visits%rowtype;
begin
  if octet_length(p_token_hash) <> 32 or p_outcome not in ('approved', 'declined') then
    raise exception 'Invalid host decision';
  end if;
  select * into token_row from public.host_decision_tokens
    where token_hash = p_token_hash for update;
  if token_row.visit_id is null or token_row.consumed_at is not null
    or token_row.expires_at <= now() then
    return 'expired_or_used';
  end if;
  select * into visit_row from public.visits where id = token_row.visit_id for update;
  if visit_row.status <> 'pending_host_acknowledgement' then
    return 'expired_or_used';
  end if;
  update public.host_decision_tokens
    set consumed_at = now(), outcome = p_outcome where visit_id = token_row.visit_id;
  if p_outcome = 'approved' then
    update public.visits set status = 'host_approved_awaiting_reception', host_approved_at = now()
      where id = token_row.visit_id;
    insert into public.visit_events (visit_id, event_type, event_source)
      values (token_row.visit_id, 'host_approved', 'host_link');
  else
    update public.visits set status = 'declined' where id = token_row.visit_id;
    insert into public.visit_events (visit_id, event_type, event_source)
      values (token_row.visit_id, 'host_declined', 'host_link');
  end if;
  return p_outcome;
end;
$$;

create function public.tgm_apply_auto_close(p_limit integer default 200)
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
    update public.visits v set status = 'auto_closed', time_out = now()
    from eligible e where v.id = e.id returning v.id
  ), events as (
    insert into public.visit_events (visit_id, event_type, event_source)
      select id, 'auto_closed', 'system' from closed returning id
  )
  select count(*) into closed_count from events;
  return closed_count;
end;
$$;

revoke all on function public.tgm_consume_public_rate_limit(bytea,timestamptz,integer),
  public.tgm_create_public_visit(uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid),
  public.tgm_respond_to_host(bytea,text),
  public.tgm_apply_auto_close(integer) from public, anon, authenticated;
grant execute on function public.tgm_consume_public_rate_limit(bytea,timestamptz,integer),
  public.tgm_create_public_visit(uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid),
  public.tgm_respond_to_host(bytea,text) to service_role;

create function tgm_private.purge_expired_visits(p_limit integer default 200)
returns integer language plpgsql security definer set search_path = '' as $$
declare removed_count integer;
begin
  if current_user <> 'postgres' then raise exception 'Database owner only'; end if;
  if p_limit < 1 or p_limit > 1000 then raise exception 'Invalid batch size'; end if;
  with expired as (
    select id from public.visits
    where arrived_at < now() - interval '12 months'
    order by arrived_at, id limit p_limit
  )
  delete from public.visits v using expired e where v.id = e.id;
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function tgm_private.purge_expired_visits(integer) from public, anon, authenticated;

create function tgm_private.purge_rate_limit_windows()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed_count integer;
begin
  if current_user <> 'postgres' then raise exception 'Database owner only'; end if;
  delete from public.public_rate_limit_windows where window_start < now() - interval '2 days';
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function tgm_private.purge_rate_limit_windows() from public, anon, authenticated;

-- Existing prototype functions remain in migration history, but are no longer
-- publicly callable once this backend is activated.
do $$
begin
  if to_regprocedure('public.register_visitor_by_qr(uuid,text,text,text,text,text)') is not null then
    revoke execute on function public.register_visitor_by_qr(uuid,text,text,text,text,text) from anon, authenticated;
  end if;
  if to_regprocedure('public.get_reception_company_by_qr(uuid)') is not null then
    revoke execute on function public.get_reception_company_by_qr(uuid) from anon, authenticated;
  end if;
  if to_regprocedure('public.get_reception_hosts_by_qr(uuid)') is not null then
    revoke execute on function public.get_reception_hosts_by_qr(uuid) from anon, authenticated;
  end if;
  if to_regprocedure('public.get_my_reception_access()') is not null then
    revoke execute on function public.get_my_reception_access() from authenticated;
  end if;
  if to_regprocedure('public.get_or_create_reception_workspace()') is not null then
    revoke execute on function public.get_or_create_reception_workspace() from authenticated;
  end if;
  if to_regprocedure('public.list_reception_team()') is not null then
    revoke execute on function public.list_reception_team() from authenticated;
  end if;
  if to_regclass('public.workspaces') is not null then
    revoke all on public.workspaces from anon, authenticated;
  end if;
  if to_regclass('public.guests') is not null then
    revoke all on public.guests from anon, authenticated;
  end if;
  if to_regclass('public.employee_hosts') is not null then
    revoke all on public.employee_hosts from anon, authenticated;
  end if;
  if to_regclass('public.workspace_reception_members') is not null then
    revoke all on public.workspace_reception_members from anon, authenticated;
  end if;
  if to_regclass('public.self_checkout_challenges') is not null then
    revoke all on public.self_checkout_challenges from anon, authenticated;
  end if;
  if exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests'
  ) then
    alter publication supabase_realtime drop table public.guests;
  end if;
end;
$$;
