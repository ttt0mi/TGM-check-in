create function public.tgm_create_assisted_visit(
  p_actor_id uuid, p_location_id uuid, p_department_id uuid, p_staff_id uuid,
  p_visitor_full_name text, p_visitor_preferred_name text,
  p_visitor_email text, p_phone_number text, p_organization text,
  p_visit_type public.tgm_visit_type, p_purpose text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare visit_id_value uuid;
begin
  if not exists (
    select 1 from public.operator_profiles p
    left join public.receptionist_location_assignments a on a.user_id = p.user_id
    join public.locations l on l.id = p_location_id and l.is_active
    where p.user_id = p_actor_id and p.is_active
      and (p.role = 'admin' or (p.role = 'receptionist' and a.location_id = p_location_id))
  ) then raise exception 'Location access denied'; end if;
  insert into public.visits (
    location_id, department_id, staff_id, visitor_full_name,
    visitor_preferred_name, visitor_email, phone_number, organization,
    visit_type, purpose, check_in_method
  ) values (
    p_location_id, p_department_id, p_staff_id, btrim(p_visitor_full_name),
    nullif(btrim(p_visitor_preferred_name), ''), nullif(lower(btrim(p_visitor_email)), ''),
    p_phone_number, nullif(btrim(p_organization), ''), p_visit_type,
    btrim(p_purpose), 'assisted'
  ) returning id into visit_id_value;
  insert into public.visit_events (visit_id, event_type, event_source)
    values (visit_id_value, 'created', 'reception');
  return visit_id_value;
end;
$$;
revoke all on function public.tgm_create_assisted_visit(
  uuid,uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text
) from public, anon, authenticated;
grant execute on function public.tgm_create_assisted_visit(
  uuid,uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text
) to service_role;
