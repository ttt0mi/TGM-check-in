-- Historical composite visit references remain anchored to the original assignment.
create function tgm_private.keep_staff_assignment_coordinates()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.location_id is distinct from old.location_id
    or new.department_id is distinct from old.department_id then
    raise exception 'Move staff through a linked new assignment';
  end if;
  return new;
end;
$$;
revoke all on function tgm_private.keep_staff_assignment_coordinates()
  from public, anon, authenticated;
create trigger staff_keep_assignment_coordinates
  before update of location_id, department_id on public.staff
  for each row execute function tgm_private.keep_staff_assignment_coordinates();
