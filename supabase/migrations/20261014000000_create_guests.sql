create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  company_name text not null default 'My company'
    check (char_length(company_name) between 1 and 120),
  reception_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  company text not null default '' check (char_length(company) <= 120),
  host_name text not null check (char_length(btrim(host_name)) between 1 and 120),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 240),
  status text not null default 'checked_in'
    check (status in ('checked_in', 'checked_out')),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guests_owner_created_at_idx
  on public.guests (owner_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.guests enable row level security;

create policy "Organizers can read their workspace"
  on public.workspaces for select
  using (auth.uid() = owner_id);

create policy "Organizers can create their workspace"
  on public.workspaces for insert
  with check (auth.uid() = owner_id);

create policy "Organizers can update their workspace"
  on public.workspaces for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Organizers can read their visitors"
  on public.guests for select
  using (auth.uid() = owner_id);

create policy "Organizers can add their visitors"
  on public.guests for insert
  with check (auth.uid() = owner_id);

create policy "Organizers can update their visitors"
  on public.guests for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create or replace function public.get_or_create_reception_workspace()
returns table(company_name text, reception_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in to open your company workspace.';
  end if;

  insert into public.workspaces (owner_id)
  values (current_user_id)
  on conflict (owner_id) do nothing;

  return query
    select w.company_name, w.reception_token
    from public.workspaces as w
    where w.owner_id = current_user_id;
end;
$$;

create or replace function public.get_reception_company_by_qr(reception_token uuid)
returns table(company_name text)
language sql
security definer
set search_path = ''
as $$
  select w.company_name
  from public.workspaces as w
  where w.reception_token = $1
  limit 1;
$$;

create or replace function public.register_visitor_by_qr(
  reception_token uuid,
  visitor_name text,
  visitor_email text,
  visitor_company text,
  visitor_host text,
  visit_purpose text
)
returns table(
  name text,
  company text,
  host_name text,
  status text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_owner_id uuid;
begin
  if char_length(btrim(visitor_name)) not between 1 and 120
    or char_length(visitor_email) > 254
    or visitor_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    or char_length(visitor_company) > 120
    or char_length(btrim(visitor_host)) not between 1 and 120
    or char_length(btrim(visit_purpose)) not between 1 and 240
  then
    raise exception 'Enter valid visitor details, a host, and a visit purpose.';
  end if;

  select w.owner_id into workspace_owner_id
  from public.workspaces as w
  where w.reception_token = $1;

  if workspace_owner_id is null then
    return;
  end if;

  return query
    insert into public.guests (
      owner_id,
      name,
      email,
      company,
      host_name,
      purpose,
      status,
      checked_in_at
    )
    values (
      workspace_owner_id,
      btrim(visitor_name),
      lower(btrim(visitor_email)),
      btrim(visitor_company),
      btrim(visitor_host),
      btrim(visit_purpose),
      'checked_in',
      now()
    )
    returning public.guests.name, public.guests.company, public.guests.host_name,
      public.guests.status, public.guests.checked_in_at;
end;
$$;

revoke all on function public.get_or_create_reception_workspace() from public;
revoke all on function public.get_reception_company_by_qr(uuid) from public;
revoke all on function public.register_visitor_by_qr(uuid, text, text, text, text, text) from public;
grant execute on function public.get_or_create_reception_workspace() to authenticated;
grant execute on function public.get_reception_company_by_qr(uuid) to anon, authenticated;
grant execute on function public.register_visitor_by_qr(uuid, text, text, text, text, text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'guests'
  ) then
    alter publication supabase_realtime add table public.guests;
  end if;
end;
$$;
