-- Supabase projects may explicitly grant function EXECUTE to anon and
-- authenticated through default privileges. Revoke every obsolete prototype
-- entry point even when the old migration also revoked from PUBLIC.
revoke execute on function public.get_my_reception_access(),
  public.get_or_create_reception_workspace(),
  public.get_reception_company_by_qr(uuid),
  public.get_reception_hosts_by_qr(uuid),
  public.register_visitor_by_qr(uuid,text,text,text,text,text,text,text,text),
  public.list_reception_team(),
  public.is_reception_member(uuid),
  public.protect_reception_guest_inserts(),
  public.protect_reception_guest_updates()
  from public, anon, authenticated;

create index visits_staff_location_department_idx
  on public.visits (staff_id, location_id, department_id)
  where staff_id is not null;
