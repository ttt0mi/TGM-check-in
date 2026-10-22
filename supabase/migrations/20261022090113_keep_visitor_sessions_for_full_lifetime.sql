-- Keep a visitor's status session readable until its original 24-hour expiry,
-- including after the visit reaches a terminal state. A session token may
-- still create only one visit.

drop trigger if exists visits_revoke_terminal_session on public.visits;
drop function if exists tgm_private.revoke_terminal_visitor_session();

-- Terminal status was the only automatic source of revocation. Restore any
-- still-current sessions before removing that obsolete state.
update tgm_private.visitor_sessions
set revoked_at = null
where expires_at > now()
  and revoked_at is not null;

drop index if exists tgm_private.visitor_sessions_expiry_idx;
drop index if exists tgm_private.visitor_sessions_revoked_idx;

alter table tgm_private.visitor_sessions
  drop column revoked_at;

create index visitor_sessions_expiry_idx
  on tgm_private.visitor_sessions (expires_at);

do $$
begin
  if exists (
    select 1
    from tgm_private.public_submission_keys
    where visitor_session_token_hash is not null
    group by visitor_session_token_hash
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce visitor session single use: duplicate token hashes exist';
  end if;
end;
$$;

create unique index public_submission_keys_visitor_session_token_hash_key
  on tgm_private.public_submission_keys (visitor_session_token_hash)
  where visitor_session_token_hash is not null;

create or replace function public.tgm_public_visit_retry_matches(
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
  if not found then
    if p_visitor_session_token_hash is not null and exists (
      select 1 from tgm_private.public_submission_keys k
      where k.visitor_session_token_hash = p_visitor_session_token_hash
    ) then
      raise sqlstate 'PT409' using message = 'Visitor session already has a visit';
    end if;
    return false;
  end if;
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

create or replace function public.tgm_create_public_visit(
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
  if p_visitor_session_token_hash is not null and exists (
    select 1 from tgm_private.public_submission_keys k
    where k.visitor_session_token_hash = p_visitor_session_token_hash
  ) then
    raise sqlstate 'PT409' using message = 'Visitor session already has a visit';
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
  begin
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
  exception when unique_violation then
    if p_visitor_session_token_hash is not null and exists (
      select 1 from tgm_private.public_submission_keys k
      where k.visitor_session_token_hash = p_visitor_session_token_hash
    ) then
      raise sqlstate 'PT409' using message = 'Visitor session already has a visit';
    end if;
    raise;
  end;
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

create or replace function public.tgm_get_visitor_visit(p_token_hash bytea)
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
    and vs.expires_at > now()
  limit 1;
$$;
revoke all on function public.tgm_get_visitor_visit(bytea) from public, anon, authenticated;
grant execute on function public.tgm_get_visitor_visit(bytea) to service_role;

create or replace function tgm_private.purge_expired_visitor_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed_count integer;
begin
  if current_user <> 'postgres' then raise exception 'Database owner only'; end if;
  delete from tgm_private.visitor_sessions
  where expires_at <= now();
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function tgm_private.purge_expired_visitor_sessions()
  from public, anon, authenticated, service_role;
