create function public.tgm_preview_operator_invitation(
  p_actor_id uuid, p_token_hash bytea
) returns table (
  state text,
  organization_name text,
  invited_email text,
  invited_role public.tgm_operator_role,
  branch_name text,
  expires_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare invitation tgm_private.operator_invitations%rowtype;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users where id = p_actor_id and email_confirmed_at is not null
  ) then
    raise exception 'Verified account required';
  end if;
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'Invalid invitation token';
  end if;
  select * into invitation from tgm_private.operator_invitations
    where token_hash = p_token_hash;
  if invitation.id is null then
    return query select 'invalid'::text, null::text, null::text,
      null::public.tgm_operator_role, null::text, null::timestamptz;
    return;
  end if;
  if invitation.accepted_at is not null or invitation.revoked_at is not null
    or invitation.expires_at <= now() then
    return query select
      case when invitation.accepted_at is not null then 'accepted'
        when invitation.revoked_at is not null then 'revoked'
        else 'expired' end::text,
      null::text, null::text, null::public.tgm_operator_role,
      null::text, null::timestamptz;
    return;
  end if;
  return query
    select 'active'::text, o.name, invitation.email, invitation.role,
      l.name, invitation.expires_at
    from public.organizations o
    left join public.locations l on l.id = invitation.location_id
    where o.id = invitation.organization_id and o.is_active
      and (invitation.location_id is null or l.is_active);
  if not found then
    return query select 'unavailable'::text, null::text, null::text,
      null::public.tgm_operator_role, null::text, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.tgm_preview_operator_invitation(uuid,bytea)
  from public, anon, authenticated;
grant execute on function public.tgm_preview_operator_invitation(uuid,bytea)
  to service_role;
