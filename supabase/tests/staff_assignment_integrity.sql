begin;
insert into public.organizations (id, name, slug)
values ('fa000000-0000-4000-8000-000000000001', 'Staff Test', 'staff-integrity-test');
insert into public.locations (id, organization_id, name) values
  ('fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001', 'Old Branch'),
  ('fa000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000001', 'New Branch');
insert into public.departments (id, organization_id, name) values
  ('fa000000-0000-4000-8000-000000000004', 'fa000000-0000-4000-8000-000000000001', 'Old Team'),
  ('fa000000-0000-4000-8000-000000000005', 'fa000000-0000-4000-8000-000000000001', 'New Team');
insert into public.staff (id, organization_id, location_id, department_id, full_name, email)
values ('fa000000-0000-4000-8000-000000000006', 'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000004',
  'Historical Host', 'staff-integrity@test.example');
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
values ('fa000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'staff-admin@test.example', now(), 'test');
update public.operator_profiles set organization_id = 'fa000000-0000-4000-8000-000000000001',
  role = 'admin', is_active = true where user_id = 'fa000000-0000-4000-8000-000000000007';
insert into public.visits (id, location_id, organization_id, staff_id, department_id,
  visitor_full_name, phone_number, visit_type, purpose, check_in_method)
values ('fa000000-0000-4000-8000-000000000008', 'fa000000-0000-4000-8000-000000000002',
  'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000006',
  'fa000000-0000-4000-8000-000000000004', 'Test Visitor', '+2348012345678',
  'business', 'Meeting', 'assisted');
update public.staff set full_name = 'Renamed Host'
where id = 'fa000000-0000-4000-8000-000000000006';
update public.visits set purpose = 'Edited purpose', staff_id = staff_id
where id = 'fa000000-0000-4000-8000-000000000008';
do $$
declare blocked boolean := false;
begin
  begin
    update public.staff set location_id = 'fa000000-0000-4000-8000-000000000003'
    where id = 'fa000000-0000-4000-8000-000000000006';
  exception when raise_exception then
    blocked := sqlerrm = 'Move staff through a linked new assignment';
  end;
  if not blocked then raise exception 'Direct assignment update was not blocked'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000007', true);
do $$
declare blocked boolean := false;
begin
  begin
    perform public.tgm_move_staff_assignment(
      'fa000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000006',
      'fa000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000005');
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Move did not block an active visit'; end if;
end;
$$;
reset role;
update public.visits set status = 'cancelled' where id = 'fa000000-0000-4000-8000-000000000008';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000007', true);
do $$
declare moved public.staff;
begin
  moved := public.tgm_move_staff_assignment(
    'fa000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000006',
    'fa000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000005');
  if moved.id = 'fa000000-0000-4000-8000-000000000006' or
    moved.person_id <> (select person_id from public.staff where id = 'fa000000-0000-4000-8000-000000000006') or
    (select is_active from public.staff where id = 'fa000000-0000-4000-8000-000000000006') then
    raise exception 'Move did not retain immutable assignment history';
  end if;
  if (select host_display_name_at_assignment from public.visits
    where id = 'fa000000-0000-4000-8000-000000000008') <> 'Historical Host' then
    raise exception 'Historical host name snapshot was lost';
  end if;
end;
$$;
rollback;
