-- Tenant cutover. Keep existing location IDs, QR slugs, visit IDs and RPC shapes.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function tgm_private.set_updated_at();

-- A platform administrator is deliberately not an organization member.
create table tgm_private.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now()
);
revoke all on tgm_private.platform_administrators from public, anon, authenticated, service_role;

alter table public.locations add column organization_id uuid;
alter table public.departments add column organization_id uuid;
alter table public.staff add column organization_id uuid;
alter table public.visits add column organization_id uuid;
alter table public.operator_profiles add column organization_id uuid;
alter table public.receptionist_location_assignments add column organization_id uuid;

-- There was only one global customer namespace before this migration.
-- Backfill it without changing public QR identifiers or existing row IDs.
do $$
declare legacy_id uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, slug)
    values (legacy_id, 'Legacy TGM Demo', 'legacy-tgm-demo-' || substr(replace(legacy_id::text, '-', ''), 1, 12));
  update public.locations set organization_id = legacy_id;
  update public.departments set organization_id = legacy_id;
  update public.staff set organization_id = legacy_id;
  update public.visits set organization_id = legacy_id;
  update public.operator_profiles set organization_id = legacy_id where role is not null;
  update public.receptionist_location_assignments set organization_id = legacy_id;
end;
$$;

alter table public.locations alter column organization_id set not null;
alter table public.departments alter column organization_id set not null;
alter table public.staff alter column organization_id set not null;
alter table public.visits alter column organization_id set not null;
alter table public.receptionist_location_assignments alter column organization_id set not null;
alter table public.operator_profiles add constraint operator_role_organization_match
  check ((role is null and organization_id is null and not is_active)
    or (role is not null and organization_id is not null));
alter table public.operator_profiles add constraint active_operator_organization
  check (not is_active or organization_id is not null);

alter table public.locations add constraint locations_organization_fk
  foreign key (organization_id) references public.organizations(id) on delete restrict;
alter table public.departments add constraint departments_organization_fk
  foreign key (organization_id) references public.organizations(id) on delete restrict;
alter table public.operator_profiles add constraint operator_organization_fk
  foreign key (organization_id) references public.organizations(id) on delete restrict;
alter table public.locations add constraint locations_id_organization_key unique (id, organization_id);
alter table public.departments add constraint departments_id_organization_key unique (id, organization_id);
alter table public.operator_profiles add constraint operator_id_organization_key unique (user_id, organization_id);

alter table public.staff add constraint staff_location_organization_fk
  foreign key (location_id, organization_id) references public.locations(id, organization_id) on delete restrict;
alter table public.staff add constraint staff_department_organization_fk
  foreign key (department_id, organization_id) references public.departments(id, organization_id) on delete restrict;
alter table public.staff add constraint staff_id_tenant_location_department_key
  unique (id, organization_id, location_id, department_id);
alter table public.receptionist_location_assignments add constraint assignment_operator_organization_fk
  foreign key (user_id, organization_id) references public.operator_profiles(user_id, organization_id) on delete restrict;
alter table public.receptionist_location_assignments add constraint assignment_location_organization_fk
  foreign key (location_id, organization_id) references public.locations(id, organization_id) on delete restrict;
alter table public.visits add constraint visits_location_organization_fk
  foreign key (location_id, organization_id) references public.locations(id, organization_id) on delete restrict;
alter table public.visits add constraint visits_department_organization_fk
  foreign key (department_id, organization_id) references public.departments(id, organization_id) on delete restrict;
alter table public.visits add constraint visits_staff_tenant_location_department_fk
  foreign key (staff_id, organization_id, location_id, department_id)
  references public.staff(id, organization_id, location_id, department_id) on delete restrict;
alter table public.visits add constraint visits_id_organization_key unique (id, organization_id);

drop index public.departments_normalized_name_key;
create unique index departments_organization_name_key on public.departments (organization_id, lower(btrim(name)));
drop index public.staff_active_email_key;
create unique index staff_active_organization_email_key on public.staff (organization_id, lower(btrim(email))) where is_active;
create index locations_organization_idx on public.locations (organization_id, id);
create index departments_organization_idx on public.departments (organization_id, id);
create index operator_profiles_organization_idx on public.operator_profiles (organization_id, role, user_id);
create index visits_organization_arrival_idx on public.visits (organization_id, arrived_at desc);

create function tgm_private.prevent_tenant_move()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.organization_id is distinct from new.organization_id then
    raise exception 'Organization cannot be changed';
  end if;
  return new;
end;
$$;
create trigger locations_prevent_tenant_move before update on public.locations
  for each row execute function tgm_private.prevent_tenant_move();
create trigger departments_prevent_tenant_move before update on public.departments
  for each row execute function tgm_private.prevent_tenant_move();
create trigger staff_prevent_tenant_move before update on public.staff
  for each row execute function tgm_private.prevent_tenant_move();
create trigger visits_prevent_tenant_move before update on public.visits
  for each row execute function tgm_private.prevent_tenant_move();
create trigger assignments_prevent_tenant_move before update on public.receptionist_location_assignments
  for each row execute function tgm_private.prevent_tenant_move();
create function tgm_private.prevent_operator_tenant_move()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.organization_id is not null and old.organization_id is distinct from new.organization_id then
    raise exception 'Operator organization cannot be changed';
  end if;
  return new;
end;
$$;
create trigger profiles_prevent_tenant_move before update on public.operator_profiles
  for each row execute function tgm_private.prevent_operator_tenant_move();

-- Authorization is based on live database membership, never user metadata.
create function tgm_private.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.operator_profiles p join public.organizations o on o.id = p.organization_id
    where p.user_id = (select auth.uid()) and p.is_active
      and p.organization_id = p_organization_id and o.is_active
  );
$$;
create function tgm_private.is_organization_admin(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.operator_profiles p join public.organizations o on o.id = p.organization_id
    where p.user_id = (select auth.uid()) and p.is_active and p.role = 'admin'
      and p.organization_id = p_organization_id and o.is_active
  );
$$;
create or replace function tgm_private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.operator_profiles p join public.organizations o on o.id = p.organization_id
    where p.user_id = (select auth.uid()) and p.is_active and p.role = 'admin' and o.is_active
  );
$$;
create or replace function tgm_private.can_access_location(p_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.locations l
    join public.organizations o on o.id = l.organization_id and o.is_active
    join public.operator_profiles p on p.user_id = (select auth.uid())
      and p.organization_id = l.organization_id and p.is_active
    left join public.receptionist_location_assignments a
      on a.user_id = p.user_id and a.organization_id = p.organization_id
    where l.id = p_location_id and (
      p.role = 'admin' or (p.role = 'receptionist' and a.location_id = l.id and l.is_active)
    )
  );
$$;
create function tgm_private.operator_can_access_location(p_actor_id uuid, p_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.locations l
    join public.organizations o on o.id = l.organization_id and o.is_active
    join public.operator_profiles p on p.user_id = p_actor_id
      and p.organization_id = l.organization_id and p.is_active
    left join public.receptionist_location_assignments a
      on a.user_id = p.user_id and a.organization_id = p.organization_id
    where l.id = p_location_id and (
      p.role = 'admin' or (p.role = 'receptionist' and a.location_id = l.id and l.is_active)
    )
  );
$$;
revoke all on function tgm_private.is_organization_member(uuid),
  tgm_private.is_organization_admin(uuid), tgm_private.operator_can_access_location(uuid,uuid)
  from public, anon, authenticated;
grant execute on function tgm_private.is_organization_member(uuid),
  tgm_private.is_organization_admin(uuid) to authenticated;

alter table public.organizations enable row level security;
revoke all on public.organizations from anon, authenticated;
grant select, update (name) on public.organizations to authenticated;
create policy organizations_read on public.organizations for select to authenticated
  using ((select tgm_private.is_organization_member(id)));
create policy organizations_update on public.organizations for update to authenticated
  using ((select tgm_private.is_organization_admin(id)))
  with check ((select tgm_private.is_organization_admin(id)));

drop policy locations_read on public.locations;
drop policy locations_insert on public.locations;
drop policy locations_update on public.locations;
create policy locations_read on public.locations for select to authenticated
  using ((select tgm_private.can_access_location(id)));
create policy locations_insert on public.locations for insert to authenticated
  with check ((select tgm_private.is_organization_admin(organization_id)));
create policy locations_update on public.locations for update to authenticated
  using ((select tgm_private.is_organization_admin(organization_id)))
  with check ((select tgm_private.is_organization_admin(organization_id)));
drop policy departments_read on public.departments;
drop policy departments_insert on public.departments;
drop policy departments_update on public.departments;
create policy departments_read on public.departments for select to authenticated
  using ((select tgm_private.is_organization_admin(organization_id)) or exists (
    select 1 from public.staff s where s.department_id = departments.id
      and s.organization_id = departments.organization_id
      and (select tgm_private.can_access_location(s.location_id))
  ));
create policy departments_insert on public.departments for insert to authenticated
  with check ((select tgm_private.is_organization_admin(organization_id)));
create policy departments_update on public.departments for update to authenticated
  using ((select tgm_private.is_organization_admin(organization_id)))
  with check ((select tgm_private.is_organization_admin(organization_id)));
drop policy staff_read on public.staff;
drop policy staff_insert on public.staff;
drop policy staff_update on public.staff;
create policy staff_read on public.staff for select to authenticated
  using ((select tgm_private.can_access_location(location_id)));
create policy staff_insert on public.staff for insert to authenticated
  with check ((select tgm_private.is_organization_admin(organization_id)));
create policy staff_update on public.staff for update to authenticated
  using ((select tgm_private.is_organization_admin(organization_id)))
  with check ((select tgm_private.is_organization_admin(organization_id)));
drop policy operator_profiles_read on public.operator_profiles;
create policy operator_profiles_read on public.operator_profiles for select to authenticated
  using (user_id = (select auth.uid()) or
    (organization_id is not null and (select tgm_private.is_organization_admin(organization_id))));
drop policy assignments_read on public.receptionist_location_assignments;
create policy assignments_read on public.receptionist_location_assignments for select to authenticated
  using (user_id = (select auth.uid()) or (select tgm_private.is_organization_admin(organization_id)));
-- Existing visits/events/notification and Realtime policies delegate to the
-- replaced can_access_location helper and therefore gain tenant isolation.

-- Invitations are bearer tokens stored only as hashes, with an email check at acceptance.
create table tgm_private.operator_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null check (char_length(email) <= 254),
  role public.tgm_operator_role not null,
  location_id uuid,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (location_id, organization_id) references public.locations(id, organization_id),
  check ((role = 'admin' and location_id is null) or (role = 'receptionist' and location_id is not null)),
  check ((accepted_by is null) = (accepted_at is null))
);
create index operator_invitations_org_email_idx on tgm_private.operator_invitations (organization_id, email);
revoke all on tgm_private.operator_invitations from public, anon, authenticated;

create function public.tgm_register_organization(p_actor_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid := gen_random_uuid();
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Invalid organization name';
  end if;
  perform 1 from public.operator_profiles where user_id = p_actor_id
    and organization_id is null and role is null and not is_active for update;
  if not found or not exists (
    select 1 from auth.users where id = p_actor_id and email_confirmed_at is not null
  ) or exists (
    select 1 from tgm_private.platform_administrators where user_id = p_actor_id
  ) then raise exception 'Organization registration unavailable'; end if;
  insert into public.organizations (id, name, slug)
    values (new_id, btrim(p_name),
      'org-' || substr(replace(new_id::text, '-', ''), 1, 24));
  update public.operator_profiles set organization_id = new_id, role = 'admin', is_active = true
    where user_id = p_actor_id;
  return new_id;
end;
$$;
revoke all on function public.tgm_register_organization(uuid,text) from public, anon, authenticated;
grant execute on function public.tgm_register_organization(uuid,text) to service_role;

create function public.tgm_create_branch(
  p_actor_id uuid, p_name text, p_address text, p_timezone text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare tenant_id uuid; branch_id uuid;
begin
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120
    or p_address is null or char_length(p_address) > 240 or p_timezone is null then
    raise exception 'Invalid branch details';
  end if;
  insert into public.locations (organization_id, name, address, timezone)
    values (tenant_id, btrim(p_name), btrim(p_address), p_timezone)
    returning id into branch_id;
  return branch_id;
end;
$$;
revoke all on function public.tgm_create_branch(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.tgm_create_branch(uuid,text,text,text) to service_role;

create function public.tgm_create_operator_invitation(
  p_actor_id uuid, p_email text, p_role public.tgm_operator_role,
  p_location_id uuid, p_token_hash bytea
) returns uuid language plpgsql security definer set search_path = '' as $$
declare tenant_id uuid; invitation_id uuid;
begin
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required'; end if;
  if p_email is null or char_length(p_email) > 254 or
    btrim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' or
    octet_length(p_token_hash) <> 32 or p_role is null or
    (p_role = 'admin' and p_location_id is not null) or
    (p_role = 'receptionist' and p_location_id is null) then
    raise exception 'Invalid invitation';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l where l.id = p_location_id
      and l.organization_id = tenant_id and l.is_active
  ) then raise exception 'Branch unavailable'; end if;
  if exists (
    select 1 from auth.users u join public.operator_profiles p on p.user_id = u.id
    where lower(u.email) = lower(btrim(p_email)) and p.organization_id is not null
  ) then raise exception 'Account already belongs to an organization'; end if;
  insert into tgm_private.operator_invitations
    (organization_id, email, role, location_id, token_hash, invited_by, expires_at)
    values (tenant_id, lower(btrim(p_email)), p_role, p_location_id,
      p_token_hash, p_actor_id, now() + interval '7 days')
    returning id into invitation_id;
  return invitation_id;
end;
$$;
revoke all on function public.tgm_create_operator_invitation(
  uuid,text,public.tgm_operator_role,uuid,bytea
) from public, anon, authenticated;
grant execute on function public.tgm_create_operator_invitation(
  uuid,text,public.tgm_operator_role,uuid,bytea
) to service_role;

create function public.tgm_accept_operator_invitation(p_actor_id uuid, p_token_hash bytea)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation tgm_private.operator_invitations%rowtype; user_email text;
begin
  if octet_length(p_token_hash) <> 32 then raise exception 'Invalid invitation'; end if;
  perform 1 from public.operator_profiles where user_id = p_actor_id
    and organization_id is null and role is null and not is_active for update;
  if not found or exists (
    select 1 from tgm_private.platform_administrators where user_id = p_actor_id
  ) then raise exception 'Account is unavailable'; end if;
  select lower(email) into user_email from auth.users
    where id = p_actor_id and email_confirmed_at is not null;
  if user_email is null then raise exception 'Verified email required'; end if;
  select i.* into invitation from tgm_private.operator_invitations i
    join public.organizations o on o.id = i.organization_id and o.is_active
    where i.token_hash = p_token_hash and i.accepted_at is null
      and i.expires_at > now() and i.email = user_email for update of i;
  if invitation.id is null then raise exception 'Invitation unavailable'; end if;
  if invitation.location_id is not null and not exists (
    select 1 from public.locations where id = invitation.location_id
      and organization_id = invitation.organization_id and is_active
  ) then raise exception 'Branch unavailable'; end if;
  update public.operator_profiles set organization_id = invitation.organization_id,
    role = invitation.role, is_active = true where user_id = p_actor_id;
  if invitation.role = 'receptionist' then
    insert into public.receptionist_location_assignments (user_id, organization_id, location_id)
      values (p_actor_id, invitation.organization_id, invitation.location_id);
  end if;
  update tgm_private.operator_invitations set accepted_by = p_actor_id, accepted_at = now()
    where id = invitation.id;
  return invitation.organization_id;
end;
$$;
revoke all on function public.tgm_accept_operator_invitation(uuid,bytea) from public, anon, authenticated;
grant execute on function public.tgm_accept_operator_invitation(uuid,bytea) to service_role;

create or replace function public.tgm_manage_operator(
  p_actor_id uuid, p_target_id uuid, p_action text,
  p_role public.tgm_operator_role default null, p_location_id uuid default null
) returns public.operator_profiles language plpgsql security definer set search_path = '' as $$
declare result_row public.operator_profiles%rowtype; tenant_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(59183472);
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required'; end if;
  if not exists (select 1 from auth.users where id = p_target_id and email_confirmed_at is not null)
    or not exists (select 1 from public.operator_profiles
      where user_id = p_target_id and organization_id = tenant_id) then
    raise exception 'Target is not a verified member of this organization';
  end if;
  if p_action = 'deactivate' then
    if p_actor_id = p_target_id then raise exception 'An admin cannot deactivate themselves'; end if;
    update public.operator_profiles set is_active = false
      where user_id = p_target_id and organization_id = tenant_id returning * into result_row;
  elsif p_action = 'assign' then
    if p_actor_id = p_target_id and p_role <> 'admin' then
      raise exception 'An admin cannot remove their own admin role';
    end if;
    if p_role is null or (p_role = 'receptionist' and p_location_id is null)
      or (p_role = 'admin' and p_location_id is not null) then
      raise exception 'Role and location do not match';
    end if;
    if p_location_id is not null and not exists (
      select 1 from public.locations where id = p_location_id
        and organization_id = tenant_id and is_active
    ) then raise exception 'Reception branch unavailable'; end if;
    update public.operator_profiles set role = p_role, is_active = false
      where user_id = p_target_id and organization_id = tenant_id returning * into result_row;
    delete from public.receptionist_location_assignments
      where user_id = p_target_id and organization_id = tenant_id;
    if p_role = 'receptionist' then
      insert into public.receptionist_location_assignments (user_id, organization_id, location_id)
        values (p_target_id, tenant_id, p_location_id);
    end if;
    update public.operator_profiles set is_active = true
      where user_id = p_target_id and organization_id = tenant_id returning * into result_row;
  else
    raise exception 'Invalid operator action';
  end if;
  return result_row;
end;
$$;

create or replace function public.tgm_operator_visit_action(
  p_actor_id uuid, p_visit_id uuid, p_action text, p_patch jsonb default '{}'::jsonb
) returns public.visits language plpgsql security definer set search_path = '' as $$
declare visit_row public.visits%rowtype; event_name text;
begin
  select * into visit_row from public.visits where id = p_visit_id for update;
  if visit_row.id is null then raise exception 'Visit not found'; end if;
  if not tgm_private.operator_can_access_location(p_actor_id, visit_row.location_id) then
    raise exception 'Location access denied';
  end if;
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

create or replace function public.tgm_mark_stale_host_email(p_actor_id uuid, p_visit_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare updated_count integer; visit_location uuid;
begin
  select location_id into visit_location from public.visits where id = p_visit_id;
  if visit_location is null or not tgm_private.operator_can_access_location(p_actor_id, visit_location) then
    raise exception 'Location access denied';
  end if;
  update public.host_notification_attempts
    set status = 'unknown', error_code = 'stale_sending_outcome_unknown'
    where visit_id = p_visit_id and status = 'sending'
      and attempted_at < now() - interval '10 minutes';
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.tgm_prepare_host_email(
  p_actor_id uuid, p_visit_id uuid, p_idempotency_key uuid, p_token_hash bytea
) returns uuid language plpgsql security definer set search_path = '' as $$
declare visit_row public.visits%rowtype; recipient text; attempt_id uuid;
begin
  if octet_length(p_token_hash) <> 32 then raise exception 'Invalid host token'; end if;
  select * into visit_row from public.visits where id = p_visit_id for update;
  if visit_row.id is null then raise exception 'Visit not found'; end if;
  if not tgm_private.operator_can_access_location(p_actor_id, visit_row.location_id) then
    raise exception 'Location access denied';
  end if;
  if visit_row.status <> 'pending_host_acknowledgement' or visit_row.staff_id is null then
    raise exception 'Visit is not awaiting host acknowledgement';
  end if;
  if exists (select 1 from public.host_notification_attempts
    where visit_id = p_visit_id and status in ('sending', 'sent', 'unknown')) then
    raise exception 'An email is already sent or its outcome needs review';
  end if;
  select email into recipient from public.staff
    where id = visit_row.staff_id and organization_id = visit_row.organization_id and is_active;
  if recipient is null then raise exception 'Host email unavailable'; end if;
  delete from public.host_decision_tokens where visit_id = p_visit_id;
  insert into public.host_decision_tokens (visit_id, token_hash, expires_at)
    values (p_visit_id, p_token_hash, now() + interval '1 day');
  insert into public.host_notification_attempts (visit_id, recipient_email, idempotency_key)
    values (p_visit_id, recipient, p_idempotency_key)
    returning id into attempt_id;
  return attempt_id;
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
  insert into public.visit_events (visit_id, event_type, event_source)
    values (visit_id_value, 'created', 'reception');
  return visit_id_value;
end;
$$;

create or replace function public.tgm_create_public_visit(
  p_public_slug uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text, p_submission_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare location_id_value uuid; tenant_id uuid; visit_id_value uuid;
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

create or replace function public.tgm_respond_to_host(p_token_hash bytea, p_outcome text)
returns text language plpgsql security definer set search_path = '' as $$
declare token_row public.host_decision_tokens%rowtype; visit_row public.visits%rowtype;
begin
  if octet_length(p_token_hash) <> 32 or p_outcome not in ('approved', 'declined') then
    raise exception 'Invalid host decision';
  end if;
  select * into token_row from public.host_decision_tokens
    where token_hash = p_token_hash for update;
  if token_row.visit_id is null or token_row.consumed_at is not null
    or token_row.expires_at <= now() then return 'expired_or_used'; end if;
  select v.* into visit_row from public.visits v
    join public.organizations o on o.id = v.organization_id and o.is_active
    where v.id = token_row.visit_id for update of v;
  if visit_row.id is null or visit_row.status <> 'pending_host_acknowledgement' then
    return 'expired_or_used';
  end if;
  update public.host_decision_tokens set consumed_at = now(), outcome = p_outcome
    where visit_id = token_row.visit_id;
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
