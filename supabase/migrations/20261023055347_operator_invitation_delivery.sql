-- Invitation links remain bearer credentials; only their hashes are stored.
alter table tgm_private.operator_invitations
  add column revoked_at timestamptz,
  add column delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'unknown')),
  add column delivered_at timestamptz,
  add column delivery_provider_id text,
  add column delivery_error text,
  add column resend_count integer not null default 0 check (resend_count >= 0);

create index operator_invitations_active_idx
  on tgm_private.operator_invitations (organization_id, created_at desc)
  where accepted_at is null and revoked_at is null;

create function public.tgm_rotate_operator_invitation(
  p_actor_id uuid, p_invitation_id uuid, p_token_hash bytea
) returns uuid language plpgsql security definer set search_path = '' as $$
declare tenant_id uuid; invitation tgm_private.operator_invitations%rowtype;
begin
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required'; end if;
  if octet_length(p_token_hash) <> 32 then raise exception 'Invalid invitation token'; end if;
  select * into invitation from tgm_private.operator_invitations
    where id = p_invitation_id and organization_id = tenant_id for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.revoked_at is not null then
    raise exception 'Invitation unavailable';
  end if;
  if invitation.location_id is not null and not exists (
    select 1 from public.locations where id = invitation.location_id
      and organization_id = tenant_id and is_active
  ) then raise exception 'Branch unavailable'; end if;
  if exists (
    select 1 from auth.users u join public.operator_profiles p on p.user_id = u.id
    where lower(u.email) = invitation.email and p.organization_id is not null
  ) then raise exception 'Account already belongs to an organization'; end if;
  update tgm_private.operator_invitations set
    token_hash = p_token_hash, expires_at = now() + interval '7 days',
    delivery_status = 'pending', delivered_at = null,
    delivery_provider_id = null, delivery_error = null,
    resend_count = resend_count + 1
    where id = p_invitation_id;
  return p_invitation_id;
end;
$$;
revoke all on function public.tgm_rotate_operator_invitation(uuid,uuid,bytea)
  from public, anon, authenticated;
grant execute on function public.tgm_rotate_operator_invitation(uuid,uuid,bytea)
  to service_role;

create function public.tgm_revoke_operator_invitation(
  p_actor_id uuid, p_invitation_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare tenant_id uuid;
begin
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required'; end if;
  update tgm_private.operator_invitations set revoked_at = now()
    where id = p_invitation_id and organization_id = tenant_id
      and accepted_at is null and revoked_at is null;
  if not found then raise exception 'Invitation unavailable'; end if;
end;
$$;
revoke all on function public.tgm_revoke_operator_invitation(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.tgm_revoke_operator_invitation(uuid,uuid)
  to service_role;

create function public.tgm_mark_operator_invitation_delivery(
  p_invitation_id uuid, p_status text, p_provider_id text default null,
  p_error text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent', 'failed', 'unknown') then
    raise exception 'Invalid delivery state';
  end if;
  update tgm_private.operator_invitations set
    delivery_status = p_status,
    delivered_at = case when p_status = 'sent' then now() else null end,
    delivery_provider_id = left(p_provider_id, 200),
    delivery_error = left(p_error, 200)
    where id = p_invitation_id and delivery_status = 'pending';
  if not found then raise exception 'Invitation delivery is unavailable'; end if;
end;
$$;
revoke all on function public.tgm_mark_operator_invitation_delivery(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.tgm_mark_operator_invitation_delivery(uuid,text,text,text)
  to service_role;

create function public.tgm_list_organization_operators(p_actor_id uuid)
returns table(user_id uuid, email text, role public.tgm_operator_role,
  is_active boolean, location_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare tenant_id uuid;
begin
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required'; end if;
  return query select p.user_id, u.email::text, p.role, p.is_active, a.location_id
    from public.operator_profiles p
    join auth.users u on u.id = p.user_id
    left join public.receptionist_location_assignments a on a.user_id = p.user_id
    where p.organization_id = tenant_id
    order by lower(u.email);
end;
$$;
revoke all on function public.tgm_list_organization_operators(uuid)
  from public, anon, authenticated;
grant execute on function public.tgm_list_organization_operators(uuid)
  to service_role;

create or replace function public.tgm_accept_operator_invitation(p_actor_id uuid, p_token_hash bytea)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation tgm_private.operator_invitations%rowtype; user_email text;
begin
  if octet_length(p_token_hash) <> 32 then raise exception 'Invalid invitation'; end if;
  perform 1 from public.operator_profiles where user_id = p_actor_id
    and organization_id is null and role is null and not is_active for update;
  if not found or exists (
    select 1 from tgm_private.platform_administrators where user_id = p_actor_id
  ) then raise exception 'Account is unavailable'; end if;
  select lower(email) into user_email from auth.users
    where id = p_actor_id and email_confirmed_at is not null;
  if user_email is null then raise exception 'Verified email required'; end if;
  select i.* into invitation from tgm_private.operator_invitations i
    join public.organizations o on o.id = i.organization_id and o.is_active
    where i.token_hash = p_token_hash and i.accepted_at is null
      and i.revoked_at is null and i.expires_at > now() and i.email = user_email
    for update of i;
  if invitation.id is null then raise exception 'Invitation unavailable'; end if;
  if invitation.location_id is not null and not exists (
    select 1 from public.locations where id = invitation.location_id
      and organization_id = invitation.organization_id and is_active
  ) then raise exception 'Branch unavailable'; end if;
  update public.operator_profiles set organization_id = invitation.organization_id,
    role = invitation.role, is_active = true where user_id = p_actor_id;
  if invitation.role = 'receptionist' then
    insert into public.receptionist_location_assignments (user_id, organization_id, location_id)
      values (p_actor_id, invitation.organization_id, invitation.location_id);
  end if;
  update tgm_private.operator_invitations set accepted_by = p_actor_id, accepted_at = now()
    where id = invitation.id;
  return invitation.organization_id;
end;
$$;
