create function public.tgm_list_organization_operators_page(
  p_actor_id uuid, p_limit integer default 26, p_search text default null,
  p_after_email text default null, p_after_id uuid default null
)
returns table (
  user_id uuid, email text, role public.tgm_operator_role,
  is_active boolean, location_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
declare tenant_id uuid;
begin
  if p_limit not between 1 and 51 or char_length(coalesce(p_search, '')) > 120
    or (p_after_email is null) <> (p_after_id is null) then
    raise exception 'Invalid operator page request' using errcode = '22023';
  end if;
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required' using errcode = '42501'; end if;
  return query
    select p.user_id, u.email::text, p.role, p.is_active, a.location_id
    from public.operator_profiles p
    join auth.users u on u.id = p.user_id
    left join public.receptionist_location_assignments a on a.user_id = p.user_id
    where p.organization_id = tenant_id
      and (nullif(btrim(p_search), '') is null or strpos(lower(u.email), lower(btrim(p_search))) > 0)
      and (p_after_email is null or (lower(u.email), p.user_id) > (lower(p_after_email), p_after_id))
    order by lower(u.email), p.user_id
    limit p_limit;
end;
$$;

revoke all on function public.tgm_list_organization_operators_page(uuid, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.tgm_list_organization_operators_page(uuid, integer, text, text, uuid)
  to service_role;
