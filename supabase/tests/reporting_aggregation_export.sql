begin;
insert into public.organizations (id, name, slug) values
  ('fb000000-0000-4000-8000-000000000001', 'Report A', 'report-a-test'),
  ('fb000000-0000-4000-8000-000000000002', 'Report B', 'report-b-test');
insert into public.locations (id, organization_id, name, timezone) values
  ('fb000000-0000-4000-8000-000000000011', 'fb000000-0000-4000-8000-000000000001', 'Lagos', 'Africa/Lagos'),
  ('fb000000-0000-4000-8000-000000000012', 'fb000000-0000-4000-8000-000000000001', 'Los Angeles', 'America/Los_Angeles'),
  ('fb000000-0000-4000-8000-000000000013', 'fb000000-0000-4000-8000-000000000002', 'Other Tenant', 'Africa/Lagos');
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password) values
  ('fb000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'report-admin@test.example', now(), 'test'),
  ('fb000000-0000-4000-8000-000000000022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'report-desk@test.example', now(), 'test');
update public.operator_profiles set organization_id = 'fb000000-0000-4000-8000-000000000001', role = 'admin', is_active = true
  where user_id = 'fb000000-0000-4000-8000-000000000021';
update public.operator_profiles set organization_id = 'fb000000-0000-4000-8000-000000000001', role = 'receptionist', is_active = true
  where user_id = 'fb000000-0000-4000-8000-000000000022';
insert into public.receptionist_location_assignments (user_id, organization_id, location_id) values
  ('fb000000-0000-4000-8000-000000000022', 'fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000011');
insert into public.visits (id, organization_id, location_id, visitor_full_name, phone_number,
  visit_type, purpose, check_in_method, arrived_at) values
  ('fb000000-0000-4000-8000-000000000031', 'fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000011', 'Lagos Visitor', '+2348012345678', 'business', 'Meeting', 'assisted', '2026-10-23T00:30:00Z'),
  ('fb000000-0000-4000-8000-000000000032', 'fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000012', 'LA Visitor', '+2348012345678', 'business', 'Meeting', 'assisted', '2026-10-23T00:30:00Z'),
  ('fb000000-0000-4000-8000-000000000033', 'fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000011', 'Lagos Later', '+2348012345678', 'business', 'Meeting', 'assisted', '2026-10-23T01:30:00Z'),
  ('fb000000-0000-4000-8000-000000000034', 'fb000000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000013', 'Other Tenant Visitor', '+2348012345678', 'business', 'Meeting', 'assisted', '2026-10-23T00:30:00Z');
do $$
declare summary jsonb; first_page record; next_count integer; audit_id uuid; denied boolean := false;
begin
  summary := public.tgm_visit_report_aggregate('fb000000-0000-4000-8000-000000000021', null,
    'custom', '2026-10-23', '2026-10-23');
  if (summary->>'total')::integer <> 2 or
    (summary->'branches'->>'fb000000-0000-4000-8000-000000000011')::integer <> 2 or
    summary->>'timezone_policy' <> 'each_branch_local_day' then
    raise exception 'Local-day aggregate or tenant scope is incorrect: %', summary;
  end if;
  summary := public.tgm_visit_report_aggregate('fb000000-0000-4000-8000-000000000021', null,
    'custom', '2026-10-22', '2026-10-22');
  if (summary->>'total')::integer <> 1 or
    (summary->'branches'->>'fb000000-0000-4000-8000-000000000012')::integer <> 1 then
    raise exception 'Los Angeles local-day boundary is incorrect';
  end if;
  summary := public.tgm_visit_report_aggregate('fb000000-0000-4000-8000-000000000022', null,
    'custom', '2026-10-23', '2026-10-23');
  if (summary->>'total')::integer <> 2 then raise exception 'Reception branch scope failed'; end if;
  begin
    perform public.tgm_visit_report_aggregate('fb000000-0000-4000-8000-000000000022',
      'fb000000-0000-4000-8000-000000000012', 'custom', '2026-10-23', '2026-10-23');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Receptionist crossed branch scope'; end if;
  select * into first_page from public.tgm_visit_report_page(
    'fb000000-0000-4000-8000-000000000021', null, 'custom', '2026-10-23', '2026-10-23',
    p_limit => 1);
  select count(*) into next_count from public.tgm_visit_report_page(
    'fb000000-0000-4000-8000-000000000021', null, 'custom', '2026-10-23', '2026-10-23',
    first_page.arrived_at, first_page.id, 1);
  if next_count <> 1 then raise exception 'Report page cursor lost a visit'; end if;
  audit_id := public.tgm_start_visit_export('fb000000-0000-4000-8000-000000000021', null,
    'custom', '2026-10-23', '2026-10-23', true);
  perform public.tgm_finish_visit_export('fb000000-0000-4000-8000-000000000021', audit_id, 2);
  if not exists (select 1 from tgm_private.visit_export_audit where id = audit_id
    and redacted and row_count = 2 and completed_at is not null) then
    raise exception 'Export audit was not completed';
  end if;
  denied := false;
  begin
    perform public.tgm_start_visit_export('fb000000-0000-4000-8000-000000000022', null,
      'custom', '2026-10-23', '2026-10-23', false);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Receptionist started an export'; end if;
end;
$$;
insert into public.visits (organization_id, location_id, visitor_full_name, phone_number,
  visit_type, purpose, check_in_method, arrived_at)
select 'fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000011',
  'Paged Visitor ' || n, '+2348012345678', 'business', 'Meeting', 'assisted',
  '2026-10-23T10:00:00Z'::timestamptz + n * interval '1 second'
from generate_series(1, 1001) n;
do $$
declare summary jsonb; cursor_time timestamptz; cursor_id uuid; second_count integer;
begin
  summary := public.tgm_visit_report_aggregate('fb000000-0000-4000-8000-000000000021', null,
    'custom', '2026-10-23', '2026-10-23');
  if (summary->>'total')::integer <> 1003 then
    raise exception 'Database aggregate lost visits beyond the first API page';
  end if;
  select p.arrived_at, p.id into cursor_time, cursor_id
  from public.tgm_visit_report_page('fb000000-0000-4000-8000-000000000021', null,
    'custom', '2026-10-23', '2026-10-23', p_limit => 500) p
  order by p.arrived_at, p.id limit 1 offset 499;
  select count(*) into second_count
  from public.tgm_visit_report_page('fb000000-0000-4000-8000-000000000021', null,
    'custom', '2026-10-23', '2026-10-23', cursor_time, cursor_id, 501);
  if second_count <> 501 then raise exception 'Keyset export page lost visits after 500 rows'; end if;
end;
$$;
set local role authenticated;
do $$
declare denied boolean := false;
begin
  begin
    perform public.tgm_visit_report_aggregate('fb000000-0000-4000-8000-000000000021');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Authenticated client called service-only report RPC'; end if;
end;
$$;
rollback;
