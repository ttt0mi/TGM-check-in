-- Run after tenant_foundation on the same disposable DB as tenant_backfill_seed.
do $$
declare snapshot tgm_private.tenancy_backfill_snapshot %rowtype;
legacy_id uuid;
begin
select * into strict snapshot
from tgm_private.tenancy_backfill_snapshot;
select id into strict legacy_id
from public.organizations
where name = 'Legacy TGM Demo';
if snapshot.locations_count <> (
    select count(*)
    from public.locations
)
or snapshot.departments_count <> (
    select count(*)
    from public.departments
)
or snapshot.staff_count <> (
    select count(*)
    from public.staff
)
or snapshot.visits_count <> (
    select count(*)
    from public.visits
)
or snapshot.operators_count <> (
    select count(*)
    from public.operator_profiles
)
or snapshot.assignments_count <> (
    select count(*)
    from public.receptionist_location_assignments
)
or snapshot.events_count <> (
    select count(*)
    from public.visit_events
)
or snapshot.qr_slugs <> (
    select jsonb_object_agg(id::text, public_slug::text)
    from public.locations
) then raise exception 'Backfill changed row counts or printed QR identifiers';
end if;
if exists (
    select 1
    from public.locations
    where organization_id <> legacy_id
)
or exists (
    select 1
    from public.departments
    where organization_id <> legacy_id
)
or exists (
    select 1
    from public.staff
    where organization_id <> legacy_id
)
or exists (
    select 1
    from public.visits
    where organization_id <> legacy_id
)
or exists (
    select 1
    from public.receptionist_location_assignments
    where organization_id <> legacy_id
)
or exists (
    select 1
    from public.operator_profiles
    where role is not null
        and organization_id <> legacy_id
)
or exists (
    select 1
    from public.operator_profiles
    where role is null
        and organization_id is not null
)
or exists (
    select 1
    from public.visits v
        left join public.locations l on l.id = v.location_id
        and l.organization_id = v.organization_id
        left join public.departments d on d.id = v.department_id
        and d.organization_id = v.organization_id
        left join public.staff s on s.id = v.staff_id
        and s.organization_id = v.organization_id
    where l.id is null
        or (
            v.department_id is not null
            and d.id is null
        )
        or (
            v.staff_id is not null
            and s.id is null
        )
) then raise exception 'Backfill produced an inconsistent organization relationship';
end if;
if exists (
    select 1
    from tgm_private.platform_administrators
) then raise exception 'A customer operator became a platform administrator';
end if;
end;
$$;
drop table tgm_private.tenancy_backfill_snapshot;