-- Atomic role and email preparation operations. Only server-side service_role
-- clients can call these RPCs; each checks live admin/operator permissions.
create function public.tgm_manage_operator(
  p_actor_id uuid, p_target_id uuid, p_action text,
  p_role public.tgm_operator_role default null, p_location_id uuid default null
)
returns public.operator_profiles language plpgsql security definer set search_path = '' as $$
declare result_row public.operator_profiles%rowtype;
begin
  if not exists (select 1 from public.operator_profiles
    where user_id = p_actor_id and role = 'admin' and is_active) then
    raise exception 'Admin access required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(59183472);
  if not exists (select 1 from auth.users where id = p_target_id and email_confirmed_at is not null) then
    raise exception 'Target must have a verified account';
  end if;
  if p_action = 'deactivate' then
    if p_actor_id = p_target_id then raise exception 'An admin cannot deactivate themselves'; end if;
    update public.operator_profiles set is_active = false where user_id = p_target_id returning * into result_row;
  elsif p_action = 'assign' then
    if p_actor_id = p_target_id and p_role <> 'admin' then
      raise exception 'An admin cannot remove their own admin role';
    end if;
    if p_role is null or (p_role = 'receptionist' and p_location_id is null)
      or (p_role = 'admin' and p_location_id is not null) then
      raise exception 'Role and location do not match';
    end if;
    if p_role = 'receptionist' and not exists (
      select 1 from public.locations where id = p_location_id and is_active
    ) then raise exception 'Reception location unavailable'; end if;
    update public.operator_profiles set role = p_role, is_active = false
      where user_id = p_target_id returning * into result_row;
    if result_row.user_id is null then raise exception 'Operator profile missing'; end if;
    delete from public.receptionist_location_assignments where user_id = p_target_id;
    if p_role = 'receptionist' then
      insert into public.receptionist_location_assignments (user_id, location_id)
        values (p_target_id, p_location_id);
    end if;
    update public.operator_profiles set is_active = true
      where user_id = p_target_id returning * into result_row;
  else
    raise exception 'Invalid operator action';
  end if;
  if result_row.user_id is null then raise exception 'Operator profile missing'; end if;
  return result_row;
end;
$$;
revoke all on function public.tgm_manage_operator(uuid,uuid,text,public.tgm_operator_role,uuid)
  from public, anon, authenticated;
grant execute on function public.tgm_manage_operator(uuid,uuid,text,public.tgm_operator_role,uuid)
  to service_role;

create function public.tgm_prepare_host_email(
  p_actor_id uuid, p_visit_id uuid, p_idempotency_key uuid, p_token_hash bytea
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare visit_row public.visits%rowtype;
declare recipient text;
declare attempt_id uuid;
begin
  if octet_length(p_token_hash) <> 32 then raise exception 'Invalid host token'; end if;
  select * into visit_row from public.visits where id = p_visit_id for update;
  if visit_row.id is null then raise exception 'Visit not found'; end if;
  if visit_row.status <> 'pending_host_acknowledgement' or visit_row.staff_id is null then
    raise exception 'Visit is not awaiting host acknowledgement';
  end if;
  if not exists (
    select 1 from public.operator_profiles p
    left join public.receptionist_location_assignments a on a.user_id = p.user_id
    left join public.locations l on l.id = a.location_id
    where p.user_id = p_actor_id and p.is_active
      and (p.role = 'admin' or (p.role = 'receptionist'
        and a.location_id = visit_row.location_id and l.is_active))
  ) then raise exception 'Location access denied'; end if;
  if exists (select 1 from public.host_notification_attempts
    where visit_id = p_visit_id and status in ('sending', 'sent', 'unknown')) then
    raise exception 'An email is already sent or its outcome needs review';
  end if;
  select email into recipient from public.staff where id = visit_row.staff_id and is_active;
  if recipient is null then raise exception 'Host email unavailable'; end if;
  delete from public.host_decision_tokens where visit_id = p_visit_id;
  insert into public.host_decision_tokens (visit_id, token_hash, expires_at)
    values (p_visit_id, p_token_hash, now() + interval '1 day');
  insert into public.host_notification_attempts (visit_id, recipient_email, idempotency_key)
    values (p_visit_id, recipient, p_idempotency_key)
    returning id into attempt_id;
  return attempt_id;
end;
$$;
revoke all on function public.tgm_prepare_host_email(uuid,uuid,uuid,bytea)
  from public, anon, authenticated;
grant execute on function public.tgm_prepare_host_email(uuid,uuid,uuid,bytea) to service_role;

create function public.tgm_finish_host_email(
  p_attempt_id uuid, p_status public.tgm_notification_status,
  p_provider_message_id text default null, p_error_code text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempt_row public.host_notification_attempts%rowtype;
begin
  if p_status not in ('sent', 'failed', 'unknown') then raise exception 'Invalid email status'; end if;
  select * into attempt_row from public.host_notification_attempts
    where id = p_attempt_id for update;
  if attempt_row.id is null or attempt_row.status <> 'sending' then return false; end if;
  update public.host_notification_attempts
    set status = p_status, provider_message_id = p_provider_message_id,
      error_code = p_error_code, sent_at = case when p_status = 'sent' then now() else null end
    where id = p_attempt_id;
  if p_status = 'sent' then
    insert into public.visit_events (visit_id, event_type, event_source)
      values (attempt_row.visit_id, 'host_email_sent', 'reception');
  elsif p_status = 'failed' then
    insert into public.visit_events (visit_id, event_type, event_source,
      metadata) values (attempt_row.visit_id, 'host_email_failed', 'reception',
      jsonb_build_object('code', coalesce(p_error_code, 'provider_rejected')));
  end if;
  return true;
end;
$$;
revoke all on function public.tgm_finish_host_email(uuid,public.tgm_notification_status,text,text)
  from public, anon, authenticated;
grant execute on function public.tgm_finish_host_email(uuid,public.tgm_notification_status,text,text)
  to service_role;
