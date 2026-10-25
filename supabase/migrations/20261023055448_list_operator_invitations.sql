create function public.tgm_list_organization_invitations(p_actor_id uuid)
returns table(id uuid, email text, role public.tgm_operator_role,
  location_id uuid, created_at timestamptz, expires_at timestamptz,
  accepted_at timestamptz, revoked_at timestamptz,
  delivery_status text, resend_count integer)
language plpgsql stable security definer set search_path = '' as $$
declare tenant_id uuid;
begin
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required'; end if;
  return query select i.id, i.email, i.role, i.location_id, i.created_at,
    i.expires_at, i.accepted_at, i.revoked_at, i.delivery_status, i.resend_count
    from tgm_private.operator_invitations i
    where i.organization_id = tenant_id
    order by i.created_at desc;
end;
$$;
revoke all on function public.tgm_list_organization_invitations(uuid)
  from public, anon, authenticated;
grant execute on function public.tgm_list_organization_invitations(uuid)
  to service_role;
