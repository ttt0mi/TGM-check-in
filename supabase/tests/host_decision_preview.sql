-- Read-only preview never consumes the token; terminal states stay distinct.
begin;
insert into public.organizations (id, name, slug)
values ('ee000000-0000-4000-8000-000000000001', 'Host Test', 'host-preview-test');
insert into public.locations (id, organization_id, name)
values ('ee000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000001', 'Lagos Branch');
insert into public.departments (id, organization_id, name)
values ('ee000000-0000-4000-8000-000000000004', 'ee000000-0000-4000-8000-000000000001', 'Operations');
insert into public.staff (id, organization_id, location_id, department_id, full_name, email)
values ('ee000000-0000-4000-8000-000000000005', 'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000004',
  'Test Host', 'host-preview@test.example');
insert into public.visits (
  id, location_id, organization_id, visitor_full_name, phone_number, visit_type,
  purpose, check_in_method, department_id, staff_id
) values (
  'ee000000-0000-4000-8000-000000000003', 'ee000000-0000-4000-8000-000000000002',
  'ee000000-0000-4000-8000-000000000001', 'Host Visitor', '+2348012345678',
  'business', 'Meeting', 'assisted', 'ee000000-0000-4000-8000-000000000004',
  'ee000000-0000-4000-8000-000000000005'
);
update public.visits set status = 'pending_host_acknowledgement', reception_reviewed_at = now()
where id = 'ee000000-0000-4000-8000-000000000003';
insert into public.host_decision_tokens (visit_id, token_hash, expires_at)
values ('ee000000-0000-4000-8000-000000000003', decode(repeat('aa', 32), 'hex'), now() + interval '1 hour');

do $$
declare first jsonb; second jsonb;
begin
  first := public.tgm_preview_host_decision(decode(repeat('aa', 32), 'hex'));
  second := public.tgm_preview_host_decision(decode(repeat('aa', 32), 'hex'));
  if first->>'state' <> 'active' or first->>'visitor_name' <> 'Host Visitor'
    or second->>'state' <> 'active' then raise exception 'Preview consumed token or lost context'; end if;
  if first ? 'visit_id' or first ? 'phone_number' then raise exception 'Preview leaked internal detail'; end if;
  if public.tgm_preview_host_decision(decode(repeat('bb', 32), 'hex'))->>'state' <> 'invalid'
    then raise exception 'Unknown token state wrong'; end if;
end;
$$;

update public.host_decision_tokens set expires_at = now() - interval '1 second';
do $$ begin
  if public.tgm_preview_host_decision(decode(repeat('aa', 32), 'hex'))->>'state' <> 'expired'
    then raise exception 'Expired token state wrong'; end if;
end $$;
update public.host_decision_tokens set consumed_at = now(), outcome = 'approved';
do $$ begin
  if public.tgm_preview_host_decision(decode(repeat('aa', 32), 'hex'))->>'state' <> 'used'
    then raise exception 'Used token state wrong'; end if;
end $$;
rollback;
