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

select set_config('request.jwt.claim.sub', 'ec000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.tgm_approve_privacy_notice(
  'ed000000-0000-4000-8000-000000000001',
  'Privacy A collects visitor details for check-in and shares them with reception and the selected host.',
  'https://example.com/privacy');

do $$
declare denied boolean := false;
begin
  if (select count(*) from public.organization_privacy_notices) <> 1 then
    raise exception 'Admin cannot read own approved notice';
  end if;
  begin
    perform public.tgm_approve_privacy_notice(
      'ed000000-0000-4000-8000-000000000002',
      'Privacy B collects visitor details for check-in and shares them with reception and the selected host.',
      'https://example.com/privacy');
  exception when others then denied := true; end;
  if not denied then raise exception 'Cross-organization approval succeeded'; end if;
end;
$$;

rollback;
