create index visits_report_scope_idx
  on public.visits (organization_id, location_id, arrived_at, id);

create function tgm_private.report_branch_scope(
  p_actor_id uuid, p_location_id uuid, p_preset text,
  p_start_date date, p_end_date date
)
returns table (branch_id uuid, branch_name text, branch_timezone text,
  start_day date, end_day date)
language plpgsql stable security definer set search_path = '' as $$
declare actor_org uuid; actor_role public.tgm_operator_role; assigned_branch uuid;
begin
  if p_preset is null or p_preset not in ('today', '7d', '30d', 'mtd', 'custom') then
    raise exception 'Invalid report preset' using errcode = '22023';
  end if;
  if p_preset = 'custom' and (p_start_date is null or p_end_date is null or
    p_end_date < p_start_date or p_end_date - p_start_date > 365) then
    raise exception 'Choose a range of up to 366 days' using errcode = '22023';
  end if;
  select p.organization_id, p.role, a.location_id
    into actor_org, actor_role, assigned_branch
  from public.operator_profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active
  left join public.receptionist_location_assignments a
    on a.user_id = p.user_id and a.organization_id = p.organization_id
  where p.user_id = p_actor_id and p.is_active and p.role in ('admin', 'receptionist');
  if actor_org is null or (actor_role = 'receptionist' and assigned_branch is null) then
    raise exception 'Operator access denied' using errcode = '42501';
  end if;
  if actor_role = 'receptionist' and p_location_id is not null
    and p_location_id <> assigned_branch then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l where l.id = p_location_id and l.organization_id = actor_org
  ) then raise exception 'Branch access denied' using errcode = '42501'; end if;
  return query
    select l.id, l.name, l.timezone,
      case p_preset
        when 'custom' then p_start_date
        when 'today' then d.local_today
        when '7d' then d.local_today - 6
        when '30d' then d.local_today - 29
        else date_trunc('month', d.local_today::timestamp)::date
      end,
      case when p_preset = 'custom' then p_end_date else d.local_today end
    from public.locations l
    cross join lateral (select (now() at time zone l.timezone)::date as local_today) d
    where l.organization_id = actor_org
      and (p_location_id is null or l.id = p_location_id)
      and (actor_role = 'admin' or (l.id = assigned_branch and l.is_active));
end;
$$;
revoke all on function tgm_private.report_branch_scope(uuid, uuid, text, date, date)
  from public, anon, authenticated;

create function public.tgm_visit_report_aggregate(
  p_actor_id uuid, p_location_id uuid default null, p_preset text default '7d',
  p_start_date date default null, p_end_date date default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare report jsonb;
begin
  with branch_scope as materialized (
    select * from tgm_private.report_branch_scope(
      p_actor_id, p_location_id, p_preset, p_start_date, p_end_date)
  ), filtered as materialized (
    select v.status, v.visit_type, v.check_in_method, v.arrived_at,
      v.admitted_at, v.time_out, b.branch_id,
      (v.arrived_at at time zone b.branch_timezone)::date as local_day,
      extract(hour from v.arrived_at at time zone b.branch_timezone)::integer as local_hour
    from branch_scope b
    join lateral (
      select v.status, v.visit_type, v.check_in_method, v.arrived_at,
        v.admitted_at, v.time_out
      from public.visits v
      where v.location_id = b.branch_id
        and v.arrived_at >= (b.start_day::timestamp at time zone b.branch_timezone)
        and v.arrived_at < ((b.end_day + 1)::timestamp at time zone b.branch_timezone)
    ) v on true
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'statuses', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status::text, count(*) n from filtered group by status) g),
    'visit_types', (select coalesce(jsonb_object_agg(visit_type, n), '{}'::jsonb)
      from (select visit_type::text, count(*) n from filtered group by visit_type) g),
    'check_in_methods', (select coalesce(jsonb_object_agg(check_in_method, n), '{}'::jsonb)
      from (select check_in_method::text, count(*) n from filtered group by check_in_method) g),
    'branches', (select coalesce(jsonb_object_agg(branch_id, n), '{}'::jsonb)
      from (select branch_id::text, count(*) n from filtered group by branch_id) g),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('date', local_day,
      'count', n) order by local_day), '[]'::jsonb)
      from (select local_day, count(*) n from filtered group by local_day) g),
    'hours', (select coalesce(jsonb_object_agg(lpad(local_hour::text, 2, '0'), n), '{}'::jsonb)
      from (select local_hour, count(*) n from filtered group by local_hour) g),
    'average_duration_minutes', (select round(avg(extract(epoch from
      (time_out - coalesce(admitted_at, arrived_at))) / 60))::integer
      from filtered where time_out is not null
        and time_out >= coalesce(admitted_at, arrived_at)),
    'branch_ranges', (select coalesce(jsonb_object_agg(branch_id,
      jsonb_build_object('start', start_day, 'end', end_day)), '{}'::jsonb)
      from branch_scope),
    'preset', p_preset,
    'start_date', case when p_preset = 'custom' then p_start_date else null end,
    'end_date', case when p_preset = 'custom' then p_end_date else null end,
    'timezone_policy', 'each_branch_local_day',
    'generated_at', now()
  ) into report;
  return report;
end;
$$;
revoke all on function public.tgm_visit_report_aggregate(uuid, uuid, text, date, date)
  from public, anon, authenticated;
grant execute on function public.tgm_visit_report_aggregate(uuid, uuid, text, date, date)
  to service_role;

create function public.tgm_visit_report_page(
  p_actor_id uuid, p_location_id uuid default null, p_preset text default '7d',
  p_start_date date default null, p_end_date date default null,
  p_after_arrived_at timestamptz default null, p_after_id uuid default null,
  p_limit integer default 501
)
returns table (
  id uuid, branch_id uuid, branch_name text, branch_timezone text,
  visitor_full_name text, visitor_preferred_name text, visitor_email text,
  phone_number text, visitor_organization text, purpose text, host_name text,
  visit_type text, status text, check_in_method text, arrived_at timestamptz,
  admitted_at timestamptz, time_out timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit not between 1 and 501 or
    (p_after_arrived_at is null) <> (p_after_id is null) then
    raise exception 'Invalid report page' using errcode = '22023';
  end if;
  return query
    with branch_scope as materialized (
      select * from tgm_private.report_branch_scope(
        p_actor_id, p_location_id, p_preset, p_start_date, p_end_date)
    )
    select v.id, b.branch_id, b.branch_name, b.branch_timezone,
      v.visitor_full_name, v.visitor_preferred_name, v.visitor_email,
      v.phone_number, v.organization, v.purpose,
      v.host_display_name_at_assignment, v.visit_type::text, v.status::text,
      v.check_in_method::text, v.arrived_at, v.admitted_at, v.time_out
    from branch_scope b
    join public.visits v on v.location_id = b.branch_id
      and v.arrived_at >= (b.start_day::timestamp at time zone b.branch_timezone)
      and v.arrived_at < ((b.end_day + 1)::timestamp at time zone b.branch_timezone)
    where p_after_arrived_at is null or
      (v.arrived_at, v.id) > (p_after_arrived_at, p_after_id)
    order by v.arrived_at, v.id
    limit p_limit;
end;
$$;
revoke all on function public.tgm_visit_report_page(uuid, uuid, text, date, date, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.tgm_visit_report_page(uuid, uuid, text, date, date, timestamptz, uuid, integer)
  to service_role;

create table tgm_private.visit_export_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  preset text not null check (preset in ('today', '7d', '30d', 'mtd', 'custom')),
  start_date date, end_date date,
  redacted boolean not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  row_count integer check (row_count >= 0)
);
alter table tgm_private.visit_export_audit enable row level security;
revoke all on tgm_private.visit_export_audit from public, anon, authenticated;

create function public.tgm_start_visit_export(
  p_actor_id uuid, p_location_id uuid, p_preset text,
  p_start_date date, p_end_date date, p_redacted boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_org uuid; audit_id uuid;
begin
  select p.organization_id into actor_org from public.operator_profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active
  where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if actor_org is null then raise exception 'Admin access required' using errcode = '42501'; end if;
  perform 1 from tgm_private.report_branch_scope(
    p_actor_id, p_location_id, p_preset, p_start_date, p_end_date);
  insert into tgm_private.visit_export_audit
    (organization_id, actor_user_id, location_id, preset, start_date, end_date, redacted)
  values (actor_org, p_actor_id, p_location_id, p_preset, p_start_date, p_end_date,
    p_redacted)
  returning id into audit_id;
  return audit_id;
end;
$$;
revoke all on function public.tgm_start_visit_export(uuid, uuid, text, date, date, boolean)
  from public, anon, authenticated;
grant execute on function public.tgm_start_visit_export(uuid, uuid, text, date, date, boolean)
  to service_role;

create function public.tgm_finish_visit_export(
  p_actor_id uuid, p_export_id uuid, p_row_count integer
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_row_count < 0 or p_row_count is null then
    raise exception 'Invalid export count' using errcode = '22023';
  end if;
  update tgm_private.visit_export_audit a
    set row_count = p_row_count, completed_at = now()
  where a.id = p_export_id and a.actor_user_id = p_actor_id and a.completed_at is null;
  if not found then raise exception 'Export audit record unavailable' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.tgm_finish_visit_export(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.tgm_finish_visit_export(uuid, uuid, integer)
  to service_role;
