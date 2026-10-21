-- Apply all migrations before tenant_foundation, then run this on a disposable DB.
insert into auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        email_confirmed_at,
        encrypted_password
    )
values (
        'aa000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'old-admin@test.example',
        now(),
        'test'
    ),
    (
        'aa000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'old-desk@test.example',
        now(),
        'test'
    ),
    (
        'aa000000-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'unassigned@test.example',
        now(),
        'test'
    );
insert into public.locations (id, public_slug, name)
values (
        'aa100000-0000-4000-8000-000000000001',
        'aa110000-0000-4000-8000-000000000001',
        'Original Branch'
    ),
    (
        'aa100000-0000-4000-8000-000000000002',
        'aa110000-0000-4000-8000-000000000002',
        'Second Branch'
    );
insert into public.departments (id, name)
values (
        'aa200000-0000-4000-8000-000000000001',
        'Reception'
    );
insert into public.staff (id, location_id, department_id, full_name, email)
values (
        'aa300000-0000-4000-8000-000000000001',
        'aa100000-0000-4000-8000-000000000001',
        'aa200000-0000-4000-8000-000000000001',
        'Original Host',
        'host@test.example'
    );
update public.operator_profiles
set role = 'admin',
    is_active = true
where user_id = 'aa000000-0000-4000-8000-000000000001';
update public.operator_profiles
set role = 'receptionist',
    is_active = true
where user_id = 'aa000000-0000-4000-8000-000000000002';
insert into public.receptionist_location_assignments (user_id, location_id)
values (
        'aa000000-0000-4000-8000-000000000002',
        'aa100000-0000-4000-8000-000000000001'
    );
insert into public.visits (
        id,
        location_id,
        department_id,
        staff_id,
        visitor_full_name,
        phone_number,
        visit_type,
        purpose,
        check_in_method,
        submission_idempotency_key
    )
values (
        'aa400000-0000-4000-8000-000000000001',
        'aa100000-0000-4000-8000-000000000001',
        'aa200000-0000-4000-8000-000000000001',
        'aa300000-0000-4000-8000-000000000001',
        'Existing Visitor',
        '+2348012345678',
        'business',
        'Backfill test',
        'qr',
        'aa440000-0000-4000-8000-000000000001'
    );
insert into public.visit_events (visit_id, event_type, event_source)
values (
        'aa400000-0000-4000-8000-000000000001',
        'created',
        'public_form'
    );
create table tgm_private.tenancy_backfill_snapshot (
    locations_count bigint not null,
    departments_count bigint not null,
    staff_count bigint not null,
    visits_count bigint not null,
    operators_count bigint not null,
    assignments_count bigint not null,
    events_count bigint not null,
    qr_slugs jsonb not null
);
insert into tgm_private.tenancy_backfill_snapshot
select (
        select count(*)
        from public.locations
    ),
    (
        select count(*)
        from public.departments
    ),
    (
        select count(*)
        from public.staff
    ),
    (
        select count(*)
        from public.visits
    ),
    (
        select count(*)
        from public.operator_profiles
    ),
    (
        select count(*)
        from public.receptionist_location_assignments
    ),
    (
        select count(*)
        from public.visit_events
    ),
    (
        select jsonb_object_agg(id::text, public_slug::text)
        from public.locations
    );