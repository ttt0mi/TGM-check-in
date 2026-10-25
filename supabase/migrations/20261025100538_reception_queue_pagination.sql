-- Queue thresholds are local branch policy. On-site visits have no overdue clock.
alter table public.locations
  add column reception_overdue_minutes integer not null default 15,
  add column host_overdue_minutes integer not null default 30,
  add column admission_overdue_minutes integer not null default 10,
  add constraint reception_overdue_minutes_range check (reception_overdue_minutes between 1 and 1440),
  add constraint host_overdue_minutes_range check (host_overdue_minutes between 1 and 1440),
  add constraint admission_overdue_minutes_range check (admission_overdue_minutes between 1 and 1440);

create index visits_active_queue_cursor_idx
  on public.visits (location_id, status, arrived_at, id)
  where status in (
    'pending_reception_review', 'pending_host_acknowledgement',
    'host_approved_awaiting_reception', 'approved_on_site'
  );

create index visits_terminal_history_cursor_idx
  on public.visits (location_id, arrived_at desc, id desc)
  where status in ('checked_out', 'declined', 'cancelled', 'auto_closed');

-- Invoker security keeps the existing visits RLS policy authoritative.
create function public.tgm_list_visit_queue(
  p_location_id uuid,
  p_status public.tgm_visit_status default null,
  p_search text default null,
  p_after_arrived_at timestamptz default null,
  p_after_id uuid default null,
  p_page_size integer default 25
)
returns setof public.visits
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_page_size not between 1 and 50
    or (p_after_arrived_at is null) <> (p_after_id is null)
    or char_length(coalesce(p_search, '')) > 80 then
    raise exception 'Invalid queue request' using errcode = '22023';
  end if;

  if p_status is null then
    return query
      select v.* from public.visits v
      where v.location_id = p_location_id
        and v.status in ('checked_out', 'declined', 'cancelled', 'auto_closed')
        and (p_after_arrived_at is null or (v.arrived_at, v.id) < (p_after_arrived_at, p_after_id))
        and (nullif(btrim(p_search), '') is null
          or strpos(lower(v.visitor_full_name), lower(btrim(p_search))) > 0
          or strpos(lower(coalesce(v.visitor_preferred_name, '')), lower(btrim(p_search))) > 0
          or strpos(v.phone_number, btrim(p_search)) > 0)
      order by v.arrived_at desc, v.id desc
      limit p_page_size;
  elsif p_status in (
    'pending_reception_review', 'pending_host_acknowledgement',
    'host_approved_awaiting_reception', 'approved_on_site'
  ) then
    return query
      select v.* from public.visits v
      where v.location_id = p_location_id
        and v.status = p_status
        and (p_after_arrived_at is null or (v.arrived_at, v.id) > (p_after_arrived_at, p_after_id))
        and (nullif(btrim(p_search), '') is null
          or strpos(lower(v.visitor_full_name), lower(btrim(p_search))) > 0
          or strpos(lower(coalesce(v.visitor_preferred_name, '')), lower(btrim(p_search))) > 0
          or strpos(v.phone_number, btrim(p_search)) > 0)
      order by v.arrived_at, v.id
      limit p_page_size;
  else
    raise exception 'Invalid queue status' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.tgm_list_visit_queue(uuid, public.tgm_visit_status, text, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.tgm_list_visit_queue(uuid, public.tgm_visit_status, text, timestamptz, uuid, integer)
  to authenticated;

create function public.tgm_visit_queue_counts(p_location_id uuid, p_search text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  if char_length(coalesce(p_search, '')) > 80 then
    raise exception 'Invalid queue search' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'pending_reception_review', count(*) filter (where v.status = 'pending_reception_review'),
    'pending_host_acknowledgement', count(*) filter (where v.status = 'pending_host_acknowledgement'),
    'host_approved_awaiting_reception', count(*) filter (where v.status = 'host_approved_awaiting_reception'),
    'approved_on_site', count(*) filter (where v.status = 'approved_on_site'),
    'history', count(*) filter (where v.status in ('checked_out', 'declined', 'cancelled', 'auto_closed'))
  ) into result
  from public.visits v
  where v.location_id = p_location_id
    and (nullif(btrim(p_search), '') is null
      or strpos(lower(v.visitor_full_name), lower(btrim(p_search))) > 0
      or strpos(lower(coalesce(v.visitor_preferred_name, '')), lower(btrim(p_search))) > 0
      or strpos(v.phone_number, btrim(p_search)) > 0);
  return result;
end;
$$;

revoke all on function public.tgm_visit_queue_counts(uuid, text) from public, anon;
grant execute on function public.tgm_visit_queue_counts(uuid, text) to authenticated;
