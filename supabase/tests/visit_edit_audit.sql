begin;
insert into public.organizations (id, name, slug)
values ('fb000000-0000-4000-8000-000000000001', 'Edit Audit Test', 'edit-audit-test');
insert into public.locations (id, organization_id, name)
values ('fb000000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000001', 'Audit Branch');
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
values ('fb000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'edit-admin@test.example', now(), 'test');
update public.operator_profiles set organization_id = 'fb000000-0000-4000-8000-000000000001',
  role = 'admin', is_active = true where user_id = 'fb000000-0000-4000-8000-000000000003';
insert into public.visits (id, location_id, organization_id, visitor_full_name, phone_number,
  visit_type, purpose, check_in_method)
values ('fb000000-0000-4000-8000-000000000004', 'fb000000-0000-4000-8000-000000000002',
  'fb000000-0000-4000-8000-000000000001', 'Original Visitor', '+2348012345678',
  'business', 'Original purpose', 'assisted');

set local role service_role;
select public.tgm_operator_visit_action(
  'fb000000-0000-4000-8000-000000000003', 'fb000000-0000-4000-8000-000000000004',
  'edit', '{"visitor_full_name":"Corrected Visitor","purpose":"Corrected purpose"}'::jsonb
);
select public.tgm_operator_visit_action(
  'fb000000-0000-4000-8000-000000000003', 'fb000000-0000-4000-8000-000000000004',
  'edit', '{"purpose":"Corrected purpose"}'::jsonb
);
reset role;
do $$
declare audit_row tgm_private.visit_edit_audit%rowtype;
begin
  if (select count(*) from tgm_private.visit_edit_audit where visit_id = 'fb000000-0000-4000-8000-000000000004') <> 1 then
    raise exception 'Visit edit audit is missing or duplicated for a no-op edit';
  end if;
  select * into audit_row from tgm_private.visit_edit_audit
  where visit_id = 'fb000000-0000-4000-8000-000000000004';
  if audit_row.actor_user_id <> 'fb000000-0000-4000-8000-000000000003'
    or audit_row.field_names <> array['purpose', 'visitor_full_name'] then
    raise exception 'Visit edit audit actor or changed field names are incorrect';
  end if;
  if not exists (select 1 from public.visit_events
    where visit_id = audit_row.visit_id and event_type = 'visit_edited'
      and actor_user_id = audit_row.actor_user_id
      and metadata = '{"fields":["purpose","visitor_full_name"]}'::jsonb) then
    raise exception 'Visit edit history event is missing or contains unsafe values';
  end if;
end;
$$;
rollback;
