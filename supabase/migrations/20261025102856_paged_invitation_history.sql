alter table tgm_private.operator_invitations add column last_attempt_at timestamptz;
update tgm_private.operator_invitations set last_attempt_at = delivered_at
where delivered_at is not null;

create function tgm_private.stamp_invitation_delivery_attempt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.delivery_status = 'pending' and new.delivery_status in ('sent', 'failed', 'unknown') then
    new.last_attempt_at := now();
  end if;
  return new;
end;
$$;
revoke all on function tgm_private.stamp_invitation_delivery_attempt() from public, anon, authenticated;
create trigger invitation_stamp_delivery_attempt
  before update of delivery_status on tgm_private.operator_invitations
  for each row execute function tgm_private.stamp_invitation_delivery_attempt();

create index operator_invitations_history_cursor_idx
  on tgm_private.operator_invitations (organization_id, created_at desc, id desc);

create function public.tgm_list_organization_invitations_page(
  p_actor_id uuid, p_limit integer default 26, p_search text default null,
  p_after_created_at timestamptz default null, p_after_id uuid default null
)
returns table (
  id uuid, email text, role public.tgm_operator_role, location_id uuid,
  created_at timestamptz, expires_at timestamptz, accepted_at timestamptz,
  revoked_at timestamptz, delivery_status text, resend_count integer,
  invited_by uuid, inviter_email text, last_attempt_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare tenant_id uuid;
begin
  if p_limit not between 1 and 51 or char_length(coalesce(p_search, '')) > 120
    or (p_after_created_at is null) <> (p_after_id is null) then
    raise exception 'Invalid invitation page request' using errcode = '22023';
  end if;
  select p.organization_id into tenant_id from public.operator_profiles p
    join public.organizations o on o.id = p.organization_id and o.is_active
    where p.user_id = p_actor_id and p.role = 'admin' and p.is_active;
  if tenant_id is null then raise exception 'Organization admin required' using errcode = '42501'; end if;
  return query
    select i.id, i.email, i.role, i.location_id, i.created_at, i.expires_at,
      i.accepted_at, i.revoked_at, i.delivery_status, i.resend_count,
      i.invited_by, u.email::text, i.last_attempt_at
    from tgm_private.operator_invitations i
    left join auth.users u on u.id = i.invited_by
    where i.organization_id = tenant_id
      and (p_after_created_at is null or (i.created_at, i.id) < (p_after_created_at, p_after_id))
      and (nullif(btrim(p_search), '') is null or strpos(lower(i.email), lower(btrim(p_search))) > 0)
    order by i.created_at desc, i.id desc
    limit p_limit;
end;
$$;
revoke all on function public.tgm_list_organization_invitations_page(uuid, integer, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.tgm_list_organization_invitations_page(uuid, integer, text, timestamptz, uuid)
  to service_role;
