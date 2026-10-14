create table if not exists public.employee_hosts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (
    char_length(email) <= 254
    and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists employee_hosts_owner_name_idx
  on public.employee_hosts (owner_id, lower(name))
  where active;

alter table public.employee_hosts enable row level security;

create policy "Organizers can read their employee directory"
  on public.employee_hosts for select
  using (auth.uid() = owner_id);

create policy "Organizers can add employees to their directory"
  on public.employee_hosts for insert
  with check (auth.uid() = owner_id);

create policy "Organizers can remove employees from their directory"
  on public.employee_hosts for delete
  using (auth.uid() = owner_id);

create policy "Organizers can update their employee directory"
  on public.employee_hosts for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

alter table public.guests
  add column if not exists host_id uuid references public.employee_hosts (id) on delete restrict,
  add column if not exists host_notified_at timestamptz;

alter table public.guests alter column checked_in_at drop not null;
alter table public.guests alter column checked_in_at drop default;
alter table public.guests alter column status set default 'pending_approval';
alter table public.guests drop constraint if exists guests_status_check;
alter table public.guests
  add constraint guests_status_check
  check (status in ('pending_approval', 'checked_in', 'checked_out'));

create or replace function public.get_reception_hosts_by_qr(reception_token uuid)
returns table(host_name text)
language sql
security definer
set search_path = ''
as $$
  select h.name
  from public.workspaces as w
  join public.employee_hosts as h on h.owner_id = w.owner_id
  where w.reception_token = $1
    and h.active
  order by h.name;
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
  matched_host public.employee_hosts%rowtype;
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

  select h.* into matched_host
  from public.employee_hosts as h
  where h.owner_id = workspace_owner_id
    and h.active
    and lower(h.name) = lower(btrim(visitor_host));

  if matched_host.id is null then
    raise exception 'Choose an employee from the company host directory.';
  end if;

  return query
    insert into public.guests (
      owner_id,
      host_id,
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
      matched_host.id,
      btrim(visitor_name),
      lower(btrim(visitor_email)),
      btrim(visitor_company),
      matched_host.name,
      btrim(visit_purpose),
      'pending_approval',
      null
    )
    returning public.guests.name, public.guests.company, public.guests.host_name,
      public.guests.status, public.guests.checked_in_at;
end;
$$;

revoke all on function public.get_reception_hosts_by_qr(uuid) from public;
grant execute on function public.get_reception_hosts_by_qr(uuid) to anon, authenticated;

revoke all on function public.register_visitor_by_qr(uuid, text, text, text, text, text) from public;
grant execute on function public.register_visitor_by_qr(uuid, text, text, text, text, text) to anon, authenticated;
