-- A person can have successive immutable staff assignments without changing historical visit FKs.
create table tgm_private.staff_people (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
revoke all on tgm_private.staff_people from public, anon, authenticated;

insert into tgm_private.staff_people (id, organization_id)
select id, organization_id from public.staff;
alter table public.staff add column person_id uuid;
update public.staff set person_id = id;
alter table public.staff
  alter column person_id set default gen_random_uuid(),
  alter column person_id set not null,
  add constraint staff_person_organization_fk foreign key (person_id, organization_id)
    references tgm_private.staff_people(id, organization_id) on delete restrict;
create unique index staff_one_active_assignment_per_person_idx
  on public.staff (person_id) where is_active;

create function tgm_private.link_staff_person()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into tgm_private.staff_people (id, organization_id)
  values (new.person_id, new.organization_id)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function tgm_private.link_staff_person() from public, anon, authenticated;
create trigger staff_link_person before insert on public.staff
  for each row execute function tgm_private.link_staff_person();

create function tgm_private.keep_staff_person()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.person_id is distinct from old.person_id then
    raise exception 'Staff person identity cannot change';
  end if;
  return new;
end;
$$;
revoke all on function tgm_private.keep_staff_person() from public, anon, authenticated;
create trigger staff_keep_person before update of person_id on public.staff
  for each row execute function tgm_private.keep_staff_person();

create function tgm_private.guard_staff_deactivation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.visits v where v.staff_id = old.id
      and v.status in ('pending_reception_review', 'pending_host_acknowledgement',
        'host_approved_awaiting_reception', 'approved_on_site')
  ) then
    raise exception 'Resolve active visits before deactivating this host';
  end if;
  return new;
end;
$$;
revoke all on function tgm_private.guard_staff_deactivation() from public, anon, authenticated;
create trigger staff_guard_deactivation before update of is_active on public.staff
  for each row execute function tgm_private.guard_staff_deactivation();

create function tgm_private.guard_department_deactivation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.staff s where s.department_id = old.id and s.is_active
  ) then
    raise exception 'Move or deactivate active staff before deactivating this department';
  end if;
  return new;
end;
$$;
revoke all on function tgm_private.guard_department_deactivation() from public, anon, authenticated;
create trigger departments_guard_deactivation before update of is_active on public.departments
  for each row execute function tgm_private.guard_department_deactivation();

-- The snapshot is immutable unless the visit's host assignment changes before review.
alter table public.visits add column host_display_name_at_assignment text;
update public.visits v set host_display_name_at_assignment = coalesce(s.preferred_name, s.full_name)
from public.staff s where v.staff_id = s.id;
create function tgm_private.snapshot_visit_host()
returns trigger language plpgsql set search_path = '' as $$
begin
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
create trigger visits_snapshot_host before insert or update of staff_id on public.visits
  for each row execute function tgm_private.snapshot_visit_host();

create table tgm_private.staff_assignment_moves (
  id bigint generated always as identity primary key,
  person_id uuid not null references tgm_private.staff_people(id) on delete restrict,
  old_assignment_id uuid not null references public.staff(id) on delete restrict,
  new_assignment_id uuid not null references public.staff(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  moved_at timestamptz not null default now()
);
revoke all on tgm_private.staff_assignment_moves from public, anon, authenticated;

create function public.tgm_move_staff_assignment(
  p_actor_id uuid, p_staff_id uuid, p_location_id uuid, p_department_id uuid
)
returns public.staff language plpgsql security definer set search_path = '' as $$
declare old_row public.staff%rowtype;
declare new_row public.staff%rowtype;
begin
  if auth.uid() is distinct from p_actor_id then
    raise exception 'Operator access denied' using errcode = '42501';
  end if;
  select * into old_row from public.staff where id = p_staff_id for update;
  if old_row.id is null or not old_row.is_active then
    raise exception 'Active staff assignment not found' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.operator_profiles p where p.user_id = p_actor_id
      and p.organization_id = old_row.organization_id and p.role = 'admin' and p.is_active
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
revoke all on function public.tgm_move_staff_assignment(uuid, uuid, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.tgm_move_staff_assignment(uuid, uuid, uuid, uuid)
  to authenticated;
