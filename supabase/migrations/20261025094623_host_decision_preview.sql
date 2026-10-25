-- Read-only host context. Only the Edge service may invoke this token-scoped RPC.
create function public.tgm_preview_host_decision(p_token_hash bytea)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare token_row public.host_decision_tokens%rowtype;
declare result jsonb;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return jsonb_build_object('state', 'invalid');
  end if;
  select * into token_row from public.host_decision_tokens where token_hash = p_token_hash;
  if token_row.visit_id is null then return jsonb_build_object('state', 'invalid'); end if;
  if token_row.consumed_at is not null then return jsonb_build_object('state', 'used'); end if;
  if token_row.expires_at <= now() then return jsonb_build_object('state', 'expired'); end if;

  select jsonb_build_object(
    'state', 'active',
    'visitor_name', coalesce(v.visitor_preferred_name, v.visitor_full_name),
    'visitor_organization', v.organization,
    'visit_type', v.visit_type,
    'purpose', v.purpose,
    'branch_name', l.name,
    'branch_timezone', l.timezone,
    'arrived_at', v.arrived_at,
    'expires_at', token_row.expires_at
  ) into result
  from public.visits v
  join public.locations l on l.id = v.location_id and l.is_active
  join public.organizations o on o.id = v.organization_id and o.is_active
  where v.id = token_row.visit_id and v.status = 'pending_host_acknowledgement';
  return coalesce(result, jsonb_build_object('state', 'used'));
end;
$$;
revoke all on function public.tgm_preview_host_decision(bytea) from public, anon, authenticated;
grant execute on function public.tgm_preview_host_decision(bytea) to service_role;
