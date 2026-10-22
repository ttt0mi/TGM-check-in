-- Run only on a migrated local or disposable test database.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password
) values
  ('ca000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'lifecycle-admin@test.example', now(), 'test'),
  ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'lifecycle-desk@test.example', now(), 'test'),
  ('cb000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'other-admin@test.example', now(), 'test');

insert into public.organizations (id, name, slug) values
  ('aa000000-0000-4000-8000-000000000001', 'Lifecycle Tenant', 'lifecycle-tenant-test'),
  ('bb000000-0000-4000-8000-000000000001', 'Other Tenant', 'other-lifecycle-tenant-test');

insert into public.locations (id, organization_id, name, timezone) values
  ('ac000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000001', 'Lifecycle Branch', 'Africa/Lagos'),
  ('bc000000-0000-4000-8000-000000000001',
    'bb000000-0000-4000-8000-000000000001', 'Other Branch', 'Africa/Lagos');

update public.operator_profiles
set organization_id = 'aa000000-0000-4000-8000-000000000001', role = 'admin', is_active = true
where user_id = 'ca000000-0000-4000-8000-000000000001';
update public.operator_profiles
set organization_id = 'aa000000-0000-4000-8000-000000000001', role = 'receptionist', is_active = true
where user_id = 'ca000000-0000-4000-8000-000000000002';
update public.operator_profiles
set organization_id = 'bb000000-0000-4000-8000-000000000001', role = 'admin', is_active = true
where user_id = 'cb000000-0000-4000-8000-000000000001';

insert into public.receptionist_location_assignments (user_id, organization_id, location_id)
values (
  'ca000000-0000-4000-8000-000000000002',
  'aa000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001'
);

do $$
declare visit_id_value uuid;
declare retry_matches boolean;
declare session_hash bytea := decode(repeat('11', 32), 'hex');
declare other_hash bytea := decode(repeat('22', 32), 'hex');
declare session_count integer;
declare event_row public.visit_events%rowtype;
declare visit_row public.visits%rowtype;
begin
  visit_id_value := public.tgm_create_public_visit(
    (select public_slug from public.locations where id = 'ac000000-0000-4000-8000-000000000001'),
    null, null, 'QR Visitor', 'QR', 'qr@test.example', '+2348012345678', null,
    'business', 'Lifecycle test', 'ad000000-0000-4000-8000-000000000001', session_hash
  );

  select count(*) into session_count from public.tgm_get_visitor_visit(session_hash);
  if session_count <> 1 then raise exception 'Active visitor session was not readable'; end if;
  if not exists (
    select 1 from public.tgm_get_visitor_visit(session_hash)
    where visitor_display_name = 'QR' and organization_name = 'Lifecycle Tenant'
      and branch_name = 'Lifecycle Branch' and not self_checkout_available
  ) then raise exception 'Visitor status response is incorrect'; end if;

  retry_matches := public.tgm_public_visit_retry_matches(
    (select public_slug from public.locations where id = 'ac000000-0000-4000-8000-000000000001'),
    null, null, 'QR Visitor', 'QR', 'qr@test.example', '+2348012345678', null,
    'business', 'Lifecycle test', 'ad000000-0000-4000-8000-000000000001', session_hash
  );
  if not retry_matches then raise exception 'Exact public retry did not match'; end if;

  begin
    perform public.tgm_public_visit_retry_matches(
      (select public_slug from public.locations where id = 'ac000000-0000-4000-8000-000000000001'),
      null, null, 'QR Visitor', 'QR', 'qr@test.example', '+2348012345678', null,
      'business', 'Lifecycle test', 'ad000000-0000-4000-8000-000000000001', other_hash
    );
    raise exception 'Changed visitor session token was accepted';
  exception when sqlstate 'PT409' then null;
  end;

  select * into event_row from public.visit_events
  where visit_id = visit_id_value and event_type = 'created';
  if event_row.organization_id <> 'aa000000-0000-4000-8000-000000000001'
    or event_row.location_id <> 'ac000000-0000-4000-8000-000000000001'
    or event_row.actor_user_id is not null then
    raise exception 'Public event context is incorrect';
  end if;

  perform public.tgm_operator_visit_action(
    'ca000000-0000-4000-8000-000000000002', visit_id_value, 'admit', '{}'::jsonb
  );
  visit_row := public.tgm_operator_visit_action(
    'ca000000-0000-4000-8000-000000000002', visit_id_value, 'checkout', '{}'::jsonb
  );
  if visit_row.checkout_method <> 'receptionist_assisted'
    or visit_row.checkout_actor_id <> 'ca000000-0000-4000-8000-000000000002'
    or visit_row.checkout_location_id <> visit_row.location_id then
    raise exception 'Reception checkout provenance is incorrect';
  end if;
  if exists (select 1 from public.tgm_get_visitor_visit(session_hash)) then
    raise exception 'Terminal visit did not revoke its visitor session';
  end if;
  if not exists (
    select 1 from public.visit_events where visit_id = visit_id_value
      and event_type = 'checked_out'
      and actor_user_id = 'ca000000-0000-4000-8000-000000000002'
      and actor_role = 'receptionist'
  ) then raise exception 'Reception checkout event lacks actor context'; end if;

  begin
    perform public.tgm_operator_visit_action(
      'ca000000-0000-4000-8000-000000000002', visit_id_value, 'correct_checkout',
      jsonb_build_object('reason', 'Reception must not correct completed visits')
    );
    raise exception 'Receptionist performed an admin correction';
  exception when raise_exception then
    if sqlerrm <> 'Admin access required' then raise; end if;
  end;

  begin
    perform public.tgm_operator_visit_action(
      'cb000000-0000-4000-8000-000000000001', visit_id_value, 'correct_checkout',
      jsonb_build_object('reason', 'Cross-tenant correction')
    );
    raise exception 'Cross-tenant admin corrected a visit';
  exception when raise_exception then
    if sqlerrm <> 'Location access denied' then raise; end if;
  end;

  visit_row := public.tgm_operator_visit_action(
    'ca000000-0000-4000-8000-000000000001', visit_id_value, 'correct_checkout',
    jsonb_build_object('reason', 'Corrected after reviewing the departure log')
  );
  if visit_row.checkout_method <> 'receptionist_assisted'
    or visit_row.checkout_corrected_by <> 'ca000000-0000-4000-8000-000000000001'
    or visit_row.checkout_correction_reason <> 'Corrected after reviewing the departure log' then
    raise exception 'Admin correction did not preserve original provenance';
  end if;
  if not exists (
    select 1 from public.visit_events where visit_id = visit_id_value
      and event_type = 'checkout_corrected' and event_source = 'admin'
      and actor_user_id = 'ca000000-0000-4000-8000-000000000001'
      and metadata->>'reason' = 'Corrected after reviewing the departure log'
  ) then raise exception 'Admin correction event is incomplete'; end if;

  begin
    update public.visit_events set metadata = '{}'::jsonb where id = event_row.id;
    raise exception 'Visit event update was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Visit events are append-only' then raise; end if;
  end;

  begin
    update public.visits
      set location_id = 'bc000000-0000-4000-8000-000000000001'
      where id = visit_id_value;
    raise exception 'Visit branch change was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Visit branch cannot be changed' then raise; end if;
  end;
end;
$$;

set local role service_role;
do $$
declare event_id_value bigint;
begin
  select id into event_id_value
  from public.visit_events
  where visit_id = (
    select id from public.visits
    where visitor_full_name = 'QR Visitor'
  )
  order by id
  limit 1;
  begin
    delete from public.visit_events where id = event_id_value;
    raise exception 'Service role deleted visit history';
  exception when raise_exception then
    if sqlerrm <> 'Visit events are append-only' then raise; end if;
  end;
end;
$$;
reset role;

do $$
declare visit_id_value uuid;
declare removed_count integer;
begin
  select id into visit_id_value
  from public.visits
  where visitor_full_name = 'QR Visitor';
  update public.visits
    set arrived_at = now() - interval '13 months'
    where id = visit_id_value;
  removed_count := tgm_private.purge_expired_visits(200);
  if removed_count <> 1 then
    raise exception 'Visit retention did not remove the expired visit';
  end if;
  if exists (select 1 from public.visit_events where visit_id = visit_id_value) then
    raise exception 'Owner-run retention did not cascade through visit events';
  end if;
end;
$$;

do $$
declare visit_id_value uuid;
declare visit_row public.visits%rowtype;
begin
  visit_id_value := public.tgm_create_assisted_visit(
    'ca000000-0000-4000-8000-000000000002',
    'ac000000-0000-4000-8000-000000000001', null, null,
    'Assisted Visitor', null, null, '+2348012345679', null,
    'business', 'Assisted lifecycle test', 'ae000000-0000-4000-8000-000000000001'
  );
  if not exists (
    select 1 from public.visit_events where visit_id = visit_id_value
      and event_type = 'created'
      and actor_user_id = 'ca000000-0000-4000-8000-000000000002'
      and actor_role = 'receptionist'
  ) then raise exception 'Assisted creation lacks actor context'; end if;
  perform public.tgm_operator_visit_action(
    'ca000000-0000-4000-8000-000000000002', visit_id_value, 'admit', '{}'::jsonb
  );
  visit_row := public.tgm_operator_visit_action(
    'ca000000-0000-4000-8000-000000000001', visit_id_value, 'correct_checkout',
    jsonb_build_object('reason', 'Visitor left while reception was unavailable')
  );
  if visit_row.checkout_method <> 'admin_correction'
    or visit_row.checkout_actor_id <> 'ca000000-0000-4000-8000-000000000001'
    or visit_row.status <> 'checked_out' then
    raise exception 'Administrative close provenance is incorrect';
  end if;
end;
$$;

do $$
declare visit_id_value uuid;
declare visit_row public.visits%rowtype;
begin
  visit_id_value := public.tgm_create_assisted_visit(
    'ca000000-0000-4000-8000-000000000002',
    'ac000000-0000-4000-8000-000000000001', null, null,
    'Auto Close Visitor', null, null, '+2348012345680', null,
    'business', 'Auto-close lifecycle test', 'ae000000-0000-4000-8000-000000000002'
  );
  perform public.tgm_operator_visit_action(
    'ca000000-0000-4000-8000-000000000002', visit_id_value, 'admit', '{}'::jsonb
  );
  update public.visits
    set arrived_at = now() - interval '2 days', admitted_at = now() - interval '2 days'
    where id = visit_id_value;
  update public.locations set auto_close_enabled = true, auto_close_local_time = '00:00'
    where id = 'ac000000-0000-4000-8000-000000000001';
  perform public.tgm_apply_auto_close(200);
  select * into visit_row from public.visits where id = visit_id_value;
  if visit_row.status <> 'auto_closed'
    or visit_row.checkout_method <> 'system_auto_close'
    or visit_row.checkout_actor_id is not null
    or visit_row.checkout_location_id <> visit_row.location_id then
    raise exception 'Auto-close provenance is incorrect';
  end if;
end;
$$;

do $$
declare visit_id_value uuid;
declare expired_hash bytea := decode(repeat('33', 32), 'hex');
declare session_count integer;
begin
  visit_id_value := public.tgm_create_public_visit(
    (select public_slug from public.locations where id = 'ac000000-0000-4000-8000-000000000001'),
    null, null, 'Expired Session', null, null, '+2348012345681', null,
    'business', 'Expiry test', 'ad000000-0000-4000-8000-000000000002', expired_hash
  );
  update tgm_private.visitor_sessions
    set issued_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
    where visit_id = visit_id_value;
  select count(*) into session_count from public.tgm_get_visitor_visit(expired_hash);
  if session_count <> 0 then raise exception 'Expired visitor session remained readable'; end if;
  perform tgm_private.purge_expired_visitor_sessions();
  if exists (select 1 from tgm_private.visitor_sessions where visit_id = visit_id_value) then
    raise exception 'Expired visitor session was not purged';
  end if;
end;
$$;

rollback;
