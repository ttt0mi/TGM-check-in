alter table public.guests
  add column first_name text,
  add column middle_name text,
  add column last_name text,
  add column phone text;

alter table public.guests
  add constraint guests_first_name_check
    check (first_name is null or char_length(btrim(first_name)) between 1 and 120),
  add constraint guests_middle_name_check
    check (middle_name is null or char_length(btrim(middle_name)) between 1 and 120),
  add constraint guests_last_name_check
    check (last_name is null or char_length(btrim(last_name)) between 1 and 120),
  add constraint guests_phone_check
    check (phone is null or char_length(btrim(phone)) between 1 and 32);

drop function public.register_visitor_by_qr(uuid, text, text, text, text, text);

create function public.register_visitor_by_qr(
  reception_token uuid,
  visitor_first_name text,
  visitor_middle_name text,
  visitor_last_name text,
  visitor_email text,
  visitor_phone text,
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
  visitor_full_name text;
begin
  visitor_full_name := concat_ws(
    ' ',
    nullif(btrim(visitor_first_name), ''),
    nullif(btrim(visitor_middle_name), ''),
    nullif(btrim(visitor_last_name), '')
  );

  if visitor_first_name is null
    or visitor_last_name is null
    or visitor_email is null
    or visitor_phone is null
    or visitor_company is null
    or visitor_host is null
    or visit_purpose is null
    or char_length(btrim(visitor_first_name)) not between 1 and 120
    or (
      visitor_middle_name is not null
      and char_length(btrim(visitor_middle_name)) not between 1 and 120
    )
    or char_length(btrim(visitor_last_name)) not between 1 and 120
    or char_length(visitor_full_name) > 120
    or char_length(btrim(visitor_email)) > 254
    or visitor_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    or char_length(btrim(visitor_phone)) not between 1 and 32
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
      first_name,
      middle_name,
      last_name,
      email,
      phone,
      company,
      host_name,
      purpose,
      status,
      checked_in_at
    )
    values (
      workspace_owner_id,
      matched_host.id,
      visitor_full_name,
      btrim(visitor_first_name),
      nullif(btrim(visitor_middle_name), ''),
      btrim(visitor_last_name),
      lower(btrim(visitor_email)),
      btrim(visitor_phone),
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

revoke all on function public.register_visitor_by_qr(uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.register_visitor_by_qr(uuid, text, text, text, text, text, text, text, text) to anon, authenticated;
