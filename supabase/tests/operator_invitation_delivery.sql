-- Run only on a migrated local or disposable database. The transaction rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
values
  ('dc000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'invite-admin-a@test.example', now(), 'test'),
  ('dc000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'invite-admin-b@test.example', now(), 'test'),
  ('dc000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'invitee@test.example', now(), 'test');

insert into public.organizations (id, name, slug) values
  ('dd000000-0000-4000-8000-000000000001', 'Invitation A', 'invitation-a-test'),
  ('dd000000-0000-4000-8000-000000000002', 'Invitation B', 'invitation-b-test');

update public.operator_profiles set role = 'admin', is_active = true,
  organization_id = 'dd000000-0000-4000-8000-000000000001'
  where user_id = 'dc000000-0000-4000-8000-000000000001';
update public.operator_profiles set role = 'admin', is_active = true,
  organization_id = 'dd000000-0000-4000-8000-000000000002'
  where user_id = 'dc000000-0000-4000-8000-000000000002';

do $$
declare invitation_id uuid; denied boolean := false;
declare cursor_created timestamptz; cursor_id uuid; n integer;
begin
  invitation_id := public.tgm_create_operator_invitation(
    'dc000000-0000-4000-8000-000000000001', 'invitee@test.example', 'admin', null,
    decode(repeat('11', 32), 'hex'));
	if not exists (
		select 1 from public.tgm_preview_operator_invitation(
			'dc000000-0000-4000-8000-000000000003', decode(repeat('11', 32), 'hex'))
		where state = 'active' and organization_name = 'Invitation A'
			and invited_email = 'invitee@test.example' and invited_role = 'admin'
	) then raise exception 'Valid invitation preview missing'; end if;
  perform public.tgm_mark_operator_invitation_delivery(invitation_id, 'sent', 'provider-1', null);
  if not exists (
    select 1 from public.tgm_list_organization_invitations_page('dc000000-0000-4000-8000-000000000001')
    where id = invitation_id and last_attempt_at is not null
      and invited_by = 'dc000000-0000-4000-8000-000000000001'
      and inviter_email = 'invite-admin-a@test.example'
  ) then raise exception 'Detailed invitation history lacks delivery or inviter context'; end if;
  if exists (
    select 1 from public.tgm_list_organization_invitations_page('dc000000-0000-4000-8000-000000000002')
    where id = invitation_id
  ) then raise exception 'Detailed invitation history crossed organizations'; end if;
  if not exists (
    select 1 from public.tgm_list_organization_invitations('dc000000-0000-4000-8000-000000000001')
    where id = invitation_id and delivery_status = 'sent'
  ) then raise exception 'Admin could not list sent invitation'; end if;
  if exists (
    select 1 from public.tgm_list_organization_invitations('dc000000-0000-4000-8000-000000000002')
    where id = invitation_id
  ) then raise exception 'Cross-organization invitation leaked'; end if;
  perform public.tgm_rotate_operator_invitation(
    'dc000000-0000-4000-8000-000000000001', invitation_id,
    decode(repeat('22', 32), 'hex'));
	if not exists (
		select 1 from public.tgm_preview_operator_invitation(
			'dc000000-0000-4000-8000-000000000003', decode(repeat('11', 32), 'hex'))
		where state = 'invalid' and invited_email is null
	) then raise exception 'Rotated token still previews invitation'; end if;
  if not exists (
    select 1 from public.tgm_list_organization_invitations('dc000000-0000-4000-8000-000000000001')
    where id = invitation_id and delivery_status = 'pending' and resend_count = 1
  ) then raise exception 'Resend did not rotate invitation'; end if;
  begin
    perform public.tgm_revoke_operator_invitation(
      'dc000000-0000-4000-8000-000000000002', invitation_id);
  exception when others then denied := true; end;
  if not denied then raise exception 'Other organization revoked invitation'; end if;
  perform public.tgm_revoke_operator_invitation(
    'dc000000-0000-4000-8000-000000000001', invitation_id);
	if not exists (
		select 1 from public.tgm_preview_operator_invitation(
			'dc000000-0000-4000-8000-000000000003', decode(repeat('22', 32), 'hex'))
		where state = 'revoked' and invited_email is null
	) then raise exception 'Revoked invitation leaked details'; end if;
  denied := false;
  begin
    perform public.tgm_accept_operator_invitation(
      'dc000000-0000-4000-8000-000000000003', decode(repeat('22', 32), 'hex'));
  exception when others then denied := true; end;
  if not denied then raise exception 'Revoked invitation was accepted'; end if;

  for n in 1..26 loop
    perform public.tgm_create_operator_invitation(
      'dc000000-0000-4000-8000-000000000001', 'invitee-' || n || '@test.example',
      'admin', null, decode(lpad(to_hex(n), 64, '0'), 'hex'));
  end loop;
  select p.created_at, p.id into cursor_created, cursor_id
  from public.tgm_list_organization_invitations_page(
    'dc000000-0000-4000-8000-000000000001', p_limit => 25) p
  order by p.created_at desc, p.id desc limit 1 offset 24;
  if (select count(*) from public.tgm_list_organization_invitations_page(
    'dc000000-0000-4000-8000-000000000001', p_limit => 25)) <> 25
    or (select count(*) from public.tgm_list_organization_invitations_page(
      'dc000000-0000-4000-8000-000000000001', p_limit => 25,
      p_after_created_at => cursor_created, p_after_id => cursor_id)) <> 2 then
    raise exception 'Invitation keyset pagination lost history';
  end if;
end;
$$;

rollback;
