-- Rollback transaction: only a matching organization admin can approve copy.
begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
values ('ec000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'privacy-admin@test.example', now(), 'test');
insert into public.organizations (id, name, slug) values
  ('ed000000-0000-4000-8000-000000000001', 'Privacy A', 'privacy-a-test'),
  ('ed000000-0000-4000-8000-000000000002', 'Privacy B', 'privacy-b-test');
update public.operator_profiles set role = 'admin', is_active = true,
  organization_id = 'ed000000-0000-4000-8000-000000000001'
  where user_id = 'ec000000-0000-4000-8000-000000000001';

do $$
begin
  if has_function_privilege('anon', 'public.tgm_approve_privacy_notice(uuid,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.tgm_approve_privacy_notice(uuid,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.tgm_approve_privacy_notice_as_admin(uuid,uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.tgm_approve_privacy_notice_as_admin(uuid,uuid,text,text)', 'execute') then
    raise exception 'Privacy approval RPC grants are unsafe';
  end if;
end;
$$;
set local role service_role;
select public.tgm_approve_privacy_notice_as_admin(
  'ec000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000001',
  'Privacy A collects visitor details for check-in and shares them with reception and the selected host.',
  'https://example.com/privacy');

do $$
declare denied boolean := false;
begin
  if (select approved_by from public.organization_privacy_notices where organization_id = 'ed000000-0000-4000-8000-000000000001')
      <> 'ec000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Privacy notice approver was not recorded';
  end if;
  begin
    perform public.tgm_approve_privacy_notice_as_admin(
      'ec000000-0000-4000-8000-000000000001',
      'ed000000-0000-4000-8000-000000000002',
      'Privacy B collects visitor details for check-in and shares them with reception and the selected host.',
      'https://example.com/privacy');
  exception when others then denied := true; end;
  if not denied then raise exception 'Cross-organization approval succeeded'; end if;
end;
$$;

update public.operator_profiles set is_active = false
where user_id = 'ec000000-0000-4000-8000-000000000001';
do $$
declare denied boolean := false;
begin
  begin
    perform public.tgm_approve_privacy_notice_as_admin(
      'ec000000-0000-4000-8000-000000000001',
      'ed000000-0000-4000-8000-000000000001',
      'Updated visitor notice for the inactive administrator must never be approved by the database.',
      'https://example.com/privacy');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Inactive admin approved privacy copy'; end if;
end;
$$;

rollback;
