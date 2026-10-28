-- Preserve the existing state machine as the core operation and wrap edits atomically.
alter function public.tgm_operator_visit_action(uuid, uuid, text, jsonb)
  rename to tgm_operator_visit_action_core;
revoke all on function public.tgm_operator_visit_action_core(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create table tgm_private.visit_edit_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  field_names text[] not null check (array_length(field_names, 1) between 1 and 9),
  edited_at timestamptz not null default now()
);
create index visit_edit_audit_visit_time_idx on tgm_private.visit_edit_audit (visit_id, edited_at desc);
revoke all on tgm_private.visit_edit_audit from public, anon, authenticated;

alter table public.visit_events drop constraint visit_events_event_type_check;
alter table public.visit_events add constraint visit_events_event_type_check
  check (event_type in (
    'created', 'reception_approved', 'host_email_sent', 'host_email_failed',
    'host_approved', 'host_declined', 'admitted', 'checked_out',
    'checkout_corrected', 'cancelled', 'auto_closed', 'visit_edited'
  ));

create function public.tgm_operator_visit_action(
  p_actor_id uuid, p_visit_id uuid, p_action text, p_patch jsonb default '{}'::jsonb
)
returns public.visits language plpgsql security definer set search_path = '' as $$
declare before_row public.visits%rowtype;
declare after_row public.visits%rowtype;
declare changed_fields text[];
declare actor_role public.tgm_operator_role;
begin
  if p_action = 'edit' then
    select * into before_row from public.visits where id = p_visit_id for update;
  end if;
  after_row := public.tgm_operator_visit_action_core(p_actor_id, p_visit_id, p_action, p_patch);
  if p_action = 'edit' then
    select array_agg(key order by key) into changed_fields
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as key
    where to_jsonb(before_row)->key is distinct from to_jsonb(after_row)->key;
    if array_length(changed_fields, 1) > 0 then
      insert into tgm_private.visit_edit_audit
        (organization_id, visit_id, actor_user_id, field_names)
      values (after_row.organization_id, p_visit_id, p_actor_id, changed_fields);
      select role into actor_role from public.operator_profiles where user_id = p_actor_id;
      insert into public.visit_events
        (visit_id, event_type, event_source, actor_user_id, actor_role, metadata)
      values (p_visit_id, 'visit_edited', 'reception', p_actor_id, actor_role,
        jsonb_build_object('fields', changed_fields));
    end if;
  end if;
  return after_row;
end;
$$;
revoke all on function public.tgm_operator_visit_action(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.tgm_operator_visit_action(uuid, uuid, text, jsonb)
  to service_role;
