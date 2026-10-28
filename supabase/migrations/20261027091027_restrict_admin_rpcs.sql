-- Privileged admin changes are reachable only through authenticated Edge boundaries.
revoke execute on function public.tgm_approve_privacy_notice(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.tgm_move_staff_assignment(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.tgm_move_staff_assignment(uuid, uuid, uuid, uuid)
  to service_role;

create function public.tgm_approve_privacy_notice_as_admin(
  p_actor_id uuid, p_organization_id uuid, p_notice_copy text, p_policy_url text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id
    where p.user_id = p_actor_id and p.organization_id = p_organization_id
      and p.role = 'admin' and p.is_active and o.is_active
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  insert into public.organization_privacy_notices (
    organization_id, notice_copy, policy_url, approved_by, approved_at
  ) values (
    p_organization_id, btrim(p_notice_copy), btrim(p_policy_url), p_actor_id, now()
  ) on conflict (organization_id) do update set
    notice_copy = excluded.notice_copy,
    policy_url = excluded.policy_url,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;
end;
$$;
revoke all on function public.tgm_approve_privacy_notice_as_admin(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.tgm_approve_privacy_notice_as_admin(uuid, uuid, text, text)
  to service_role;

create or replace function public.tgm_move_staff_assignment(
  p_actor_id uuid, p_staff_id uuid, p_location_id uuid, p_department_id uuid
) returns public.staff
language plpgsql security definer set search_path = '' as $$
declare old_row public.staff%rowtype;
declare new_row public.staff%rowtype;
begin
  select * into old_row from public.staff where id = p_staff_id for update;
  if old_row.id is null or not old_row.is_active then
    raise exception 'Active staff assignment not found' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id
    where p.user_id = p_actor_id and p.organization_id = old_row.organization_id
      and p.role = 'admin' and p.is_active and o.is_active
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if (p_location_id, p_department_id) = (old_row.location_id, old_row.department_id) then
    raise exception 'Choose a different branch or department' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.locations l where l.id = p_location_id
      and l.organization_id = old_row.organization_id and l.is_active
  ) or not exists (
    select 1 from public.departments d where d.id = p_department_id
      and d.organization_id = old_row.organization_id and d.is_active
  ) then
    raise exception 'Target branch or department is unavailable' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.visits v where v.staff_id = old_row.id
      and v.status in ('pending_reception_review', 'pending_host_acknowledgement',
        'host_approved_awaiting_reception', 'approved_on_site')
  ) then
    raise exception 'Resolve active visits before moving this host' using errcode = '23514';
  end if;
  update public.staff set is_active = false where id = old_row.id;
  insert into public.staff (person_id, organization_id, location_id, department_id,
    full_name, preferred_name, email)
  values (old_row.person_id, old_row.organization_id, p_location_id, p_department_id,
    old_row.full_name, old_row.preferred_name, old_row.email)
  returning * into new_row;
  insert into tgm_private.staff_assignment_moves
    (person_id, old_assignment_id, new_assignment_id, actor_user_id)
  values (old_row.person_id, old_row.id, new_row.id, p_actor_id);
  return new_row;
end;
$$;
