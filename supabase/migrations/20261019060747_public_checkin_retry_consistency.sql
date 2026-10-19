-- Keep an immutable fingerprint of the original request for the lifetime of
-- the visit. Never grant direct access to these fingerprints to API clients.
create table tgm_private.public_submission_keys (
  idempotency_key uuid primary key,
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  request_hash bytea not null check (octet_length(request_hash) = 32)
);
revoke all on tgm_private.public_submission_keys from public, anon, authenticated;

create function tgm_private.public_submission_hash(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text
) returns bytea language sql immutable set search_path = '' as $$
  select pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
    p_public_slug, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    btrim(p_phone_number), nullif(btrim(p_organization), ''), p_visit_type, btrim(p_purpose)
  )::text, 'UTF8'));
$$;
revoke all on function tgm_private.public_submission_hash(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text
) from public, anon, authenticated;

-- Existing visits are the best available snapshot for pre-migration retries.
insert into tgm_private.public_submission_keys (idempotency_key, visit_id, request_hash)
select v.submission_idempotency_key, v.id, tgm_private.public_submission_hash(
  l.public_slug, v.department_id, v.staff_id, v.visitor_full_name,
  v.visitor_preferred_name, v.visitor_email, v.phone_number, v.organization,
  v.visit_type, v.purpose
)
from public.visits v join public.locations l on l.id = v.location_id
where v.submission_idempotency_key is not null;

-- This read-only check lets a matching retry succeed without reusing a
-- single-use Turnstile token. The create function repeats it under a lock.
create function public.tgm_public_visit_retry_matches(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare existing_hash bytea;
begin
  if p_submission_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;
  select k.request_hash into existing_hash from tgm_private.public_submission_keys k
    where k.idempotency_key = p_submission_idempotency_key;
  if not found then return false; end if;
  if existing_hash <> tgm_private.public_submission_hash(
    p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
    p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
    p_visit_type, p_purpose
  ) then
    raise sqlstate 'PT409' using message = 'Idempotency key already used for a different request';
  end if;
  return true;
end;
$$;
revoke all on function public.tgm_public_visit_retry_matches(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) from public, anon, authenticated;
grant execute on function public.tgm_public_visit_retry_matches(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) to service_role;

create or replace function public.tgm_create_public_visit(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare location_id_value uuid; visit_id_value uuid;
begin
  if p_submission_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_idempotency_key::text, 0));
  if public.tgm_public_visit_retry_matches(
    p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
    p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
    p_visit_type, p_purpose, p_submission_idempotency_key
  ) then
    select k.visit_id into visit_id_value from tgm_private.public_submission_keys k
      where k.idempotency_key = p_submission_idempotency_key;
    return visit_id_value;
  end if;
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
    btrim(p_phone_number), nullif(btrim(p_organization), ''), p_visit_type,
    btrim(p_purpose), 'qr', p_submission_idempotency_key
  ) returning id into visit_id_value;
  insert into tgm_private.public_submission_keys (idempotency_key, visit_id, request_hash)
    values (p_submission_idempotency_key, visit_id_value, tgm_private.public_submission_hash(
      p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
      p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
      p_visit_type, p_purpose
    ));
  insert into public.visit_events (visit_id, event_type, event_source)
    values (visit_id_value, 'created', 'public_form');
  return visit_id_value;
end;
$$;
-- Retain the original privileged-only RPC access explicitly.
revoke all on function public.tgm_create_public_visit(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) from public, anon, authenticated;
grant execute on function public.tgm_create_public_visit(
  uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid
) to service_role;
