-- Edge Functions derive tenant activity through service-role reads.
-- This role bypasses RLS but still needs a table SELECT grant.
grant select on public.organizations to service_role;
