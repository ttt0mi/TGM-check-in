-- Replays remain idempotent, but only while the original branch and its
-- organization are active. The server checks this before calling the RPC too.
create or replace function public.tgm_public_visit_retry_matches(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare existing_hash bytea; existing_visit_id uuid;
begin
  if p_submission_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;
  select k.request_hash, k.visit_id into existing_hash, existing_visit_id
    from tgm_private.public_submission_keys k
    where k.idempotency_key = p_submission_idempotency_key;
  if not found then return false; end if;
  if existing_hash <> tgm_private.public_submission_hash(
    p_public_slug, p_department_id, p_staff_id, p_visitor_full_name,
    p_visitor_preferred_name, p_visitor_email, p_phone_number, p_organization,
    p_visit_type, p_purpose
  ) then
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
