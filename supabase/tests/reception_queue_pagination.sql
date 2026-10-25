-- More than 100 recent terminal visits must not displace an older active one.
begin;
insert into public.organizations (id, name, slug)
values ('ef000000-0000-4000-8000-000000000001', 'Queue Test', 'queue-test');
insert into public.locations (id, organization_id, name)
values ('ef000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001', 'Queue Branch');
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
values ('ef000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'queue-admin@test.example', now(), 'test');
update public.operator_profiles set organization_id = 'ef000000-0000-4000-8000-000000000001',
  role = 'admin', is_active = true
where user_id = 'ef000000-0000-4000-8000-000000000003';

insert into public.visits (location_id, organization_id, visitor_full_name, phone_number,
  visit_type, purpose, check_in_method, arrived_at)
values ('ef000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001',
  'Older Active Visitor', '+2348012345678', 'business', 'Meeting', 'assisted', now() - interval '20 days');

insert into public.visits (location_id, organization_id, visitor_full_name, phone_number,
  visit_type, purpose, check_in_method, arrived_at)
select 'ef000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001',
  'Completed Visitor ' || n, '+2348012345678', 'business', 'Meeting', 'assisted', now() - interval '1 day'
from generate_series(1, 101) as n;
update public.visits set status = 'cancelled'
where visitor_full_name like 'Completed Visitor %';

do $$
declare
  branch uuid := 'ef000000-0000-4000-8000-000000000002';
  first_page public.visits[];
  second_page public.visits[];
  third_page public.visits[];
  counts jsonb;
begin
  if (select count(*) from public.tgm_list_visit_queue(branch, 'pending_reception_review')) <> 1 then
    raise exception 'Older active visit disappeared behind completed history';
  end if;
  select array_agg(v) into first_page from public.tgm_list_visit_queue(branch, null, p_page_size => 50) v;
  select array_agg(v) into second_page from public.tgm_list_visit_queue(
    branch, null, p_after_arrived_at => first_page[50].arrived_at,
    p_after_id => first_page[50].id, p_page_size => 50
  ) v;
  select array_agg(v) into third_page from public.tgm_list_visit_queue(
    branch, null, p_after_arrived_at => second_page[50].arrived_at,
    p_after_id => second_page[50].id, p_page_size => 50
  ) v;
  if array_length(first_page, 1) <> 50 or array_length(second_page, 1) <> 50
    or array_length(third_page, 1) <> 1 then
    raise exception 'Terminal keyset pages lost visits';
  end if;
  if first_page[50].id = second_page[1].id or second_page[50].id = third_page[1].id then
    raise exception 'Terminal keyset pages overlap';
  end if;
  counts := public.tgm_visit_queue_counts(branch);
  if (counts->>'pending_reception_review')::int <> 1 or (counts->>'history')::int <> 101 then
    raise exception 'Queue counts are incorrect';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ef000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.tgm_list_visit_queue(
    'ef000000-0000-4000-8000-000000000002', 'pending_reception_review')) <> 1 then
    raise exception 'Authenticated branch operator cannot read the older active visit';
  end if;
  if (public.tgm_visit_queue_counts('ef000000-0000-4000-8000-000000000002')->>'history')::int <> 101 then
    raise exception 'Authenticated queue counts failed';
  end if;
end;
$$;
rollback;
