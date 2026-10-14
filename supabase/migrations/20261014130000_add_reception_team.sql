create table if not exists public.workspace_reception_members (
  owner_id uuid not null references public.workspaces (owner_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, user_id),
  check (owner_id <> user_id)
);

alter table public.workspace_reception_members enable row level security;

create or replace function public.is_reception_member(workspace_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_reception_members as member
    where member.owner_id = $1
      and member.user_id = auth.uid()
  );
$$;

revoke all on function public.is_reception_member(uuid) from public;
grant execute on function public.is_reception_member(uuid) to authenticated;

create policy "Reception team can read their workspace"
  on public.workspaces for select
  using (auth.uid() = owner_id or public.is_reception_member(owner_id));

create policy "Reception team can read their visitor log"
  on public.guests for select
  using (auth.uid() = owner_id or public.is_reception_member(owner_id));

create policy "Reception team can add pending visitors"
  on public.guests for insert
  with check (auth.uid() = owner_id or public.is_reception_member(owner_id));

create policy "Reception team can update visitor status"
  on public.guests for update
  using (auth.uid() = owner_id or public.is_reception_member(owner_id))
  with check (auth.uid() = owner_id or public.is_reception_member(owner_id));

create or replace function public.get_my_reception_access()
returns table(company_name text, reception_token uuid, owner_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in to open the reception workspace.';
  end if;

  if exists (
    select 1 from public.workspaces as w where w.owner_id = current_user_id
  ) then
    return query
      select w.company_name, w.reception_token, w.owner_id, 'admin'::text
      from public.workspaces as w
      where w.owner_id = current_user_id;
    return;
  end if;

  if exists (
    select 1
    from public.workspace_reception_members as member
    where member.user_id = current_user_id
  ) then
    return query
      select w.company_name, w.reception_token, w.owner_id, 'reception'::text
      from public.workspace_reception_members as member
      join public.workspaces as w on w.owner_id = member.owner_id
      where member.user_id = current_user_id
      limit 1;
    return;
  end if;

  insert into public.workspaces (owner_id)
  values (current_user_id)
  on conflict (owner_id) do nothing;

  return query
    select w.company_name, w.reception_token, w.owner_id, 'admin'::text
    from public.workspaces as w
    where w.owner_id = current_user_id;
end;
$$;

revoke all on function public.get_my_reception_access() from public;
grant execute on function public.get_my_reception_access() to authenticated;
revoke all on function public.get_or_create_reception_workspace() from authenticated;

create or replace function public.list_reception_team()
returns table(user_id uuid, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not exists (
    select 1 from public.workspaces as w where w.owner_id = current_user_id
  ) then
    raise exception 'Only company administrators can view the reception team.';
  end if;

  return query
    select member.user_id, users.email::text, member.created_at
    from public.workspace_reception_members as member
    join auth.users as users on users.id = member.user_id
    where member.owner_id = current_user_id
    order by member.created_at;
end;
$$;

revoke all on function public.list_reception_team() from public;
grant execute on function public.list_reception_team() to authenticated;

create or replace function public.protect_reception_guest_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_reception_member(old.owner_id) and auth.uid() <> old.owner_id then
    if new.id is distinct from old.id
      or new.owner_id is distinct from old.owner_id
      or new.host_id is distinct from old.host_id
      or new.name is distinct from old.name
      or new.email is distinct from old.email
      or new.company is distinct from old.company
      or new.host_name is distinct from old.host_name
      or new.purpose is distinct from old.purpose
      or new.created_at is distinct from old.created_at
      or new.status not in ('pending_approval', 'checked_in', 'checked_out')
      or (
        new.status = 'checked_out'
        and (new.checked_out_at is null or new.checked_in_at is distinct from old.checked_in_at)
      )
      or (
        new.status = 'checked_in'
        and (new.checked_in_at is null or new.checked_out_at is not null)
      )
    then
      raise exception 'Reception staff can only approve, check in, or check out visitors.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_reception_guest_inserts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_reception_member(new.owner_id) and auth.uid() <> new.owner_id then
    if new.status <> 'pending_approval'
      or new.checked_in_at is not null
      or new.checked_out_at is not null
      or new.host_notified_at is not null
      or not exists (
        select 1
        from public.employee_hosts as host
        where host.id = new.host_id
          and host.owner_id = new.owner_id
          and host.active
      )
    then
      raise exception 'Reception staff can only add a visitor request for an active host.';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_reception_guest_inserts
  before insert on public.guests
  for each row execute function public.protect_reception_guest_inserts();

create trigger protect_reception_guest_updates
  before update on public.guests
  for each row execute function public.protect_reception_guest_updates();
