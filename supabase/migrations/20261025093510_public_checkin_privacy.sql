-- Public check-in is closed until an organization admin approves its notice.
create table public.organization_privacy_notices (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  notice_copy text not null check (char_length(btrim(notice_copy)) between 40 and 2000),
  policy_url text not null check (policy_url ~ '^https://[^[:space:]<>]+$' and char_length(policy_url) <= 2048),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now()
);

alter table public.organization_privacy_notices enable row level security;
revoke all on public.organization_privacy_notices from public, anon, authenticated;
grant select on public.organization_privacy_notices to authenticated, service_role;
create policy organization_privacy_notices_admin_read on public.organization_privacy_notices
  for select to authenticated using ((select tgm_private.is_organization_admin(organization_id)));

create function public.tgm_approve_privacy_notice(
  p_organization_id uuid, p_notice_copy text, p_policy_url text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not tgm_private.is_organization_admin(p_organization_id) then
    raise exception 'Administrator access required' using errcode = 'PT403';
  end if;
  insert into public.organization_privacy_notices (
    organization_id, notice_copy, policy_url, approved_by, approved_at
  ) values (
    p_organization_id, btrim(p_notice_copy), btrim(p_policy_url), auth.uid(), now()
  ) on conflict (organization_id) do update set
    notice_copy = excluded.notice_copy,
    policy_url = excluded.policy_url,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;
end;
$$;
revoke all on function public.tgm_approve_privacy_notice(uuid, text, text) from public, anon, authenticated;
grant execute on function public.tgm_approve_privacy_notice(uuid, text, text) to authenticated;
