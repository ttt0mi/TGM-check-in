-- Run only on a migrated local or disposable test database.
begin;
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
        'c1000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'admin-a@test.example',
        now(),
        'test'
    ),
    (
        'c1000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'desk-a@test.example',
        now(),
        'test'
    ),
    (
        'c2000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'admin-b@test.example',
        now(),
        'test'
    ),
    (
        'c3000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'founder@test.example',
        now(),
        'test'
    ),
    (
        'c3000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'invitee@test.example',
        now(),
        'test'
    ),
    (
        'c3000000-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'platform@test.example',
        now(),
        'test'
    );
insert into tgm_private.platform_administrators (user_id)
values ('c3000000-0000-4000-8000-000000000003');
insert into public.organizations (id, name, slug)
values (
        '11111111-1111-4111-8111-111111111111',
        'Tenant A',
        'tenant-a-test'
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'Tenant B',
        'tenant-b-test'
    );
insert into public.locations (id, organization_id, name)
values (
        'a1000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111',
        'A One'
    ),
    (
        'a1000000-0000-4000-8000-000000000002',
        '11111111-1111-4111-8111-111111111111',
        'A Two'
    ),
    (
        'b2000000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222',
        'B One'
    );
insert into public.departments (id, organization_id, name)
values (
        'd1000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111',
        'Reception'
    ),
    (
        'd2000000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222',
        'Reception'
    );
insert into public.staff (
        id,
        organization_id,
        location_id,
        department_id,
        full_name,
        email
    )
values (
        'e1000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111',
        'a1000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001',
        'Host A',
        'same@test.example'
    ),
    (
        'e2000000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222',
        'b2000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001',
        'Host B',
        'same@test.example'
    );
update public.operator_profiles
set organization_id = '11111111-1111-4111-8111-111111111111',
    role = 'admin',
    is_active = true
where user_id = 'c1000000-0000-4000-8000-000000000001';
update public.operator_profiles
set organization_id = '11111111-1111-4111-8111-111111111111',
    role = 'receptionist',
    is_active = true
where user_id = 'c1000000-0000-4000-8000-000000000002';
update public.operator_profiles
set organization_id = '22222222-2222-4222-8222-222222222222',
    role = 'admin',
    is_active = true
where user_id = 'c2000000-0000-4000-8000-000000000001';
insert into public.receptionist_location_assignments (user_id, organization_id, location_id)
values (
        'c1000000-0000-4000-8000-000000000002',
        '11111111-1111-4111-8111-111111111111',
        'a1000000-0000-4000-8000-000000000001'
    );
insert into public.visits (
        id,
        organization_id,
        location_id,
        visitor_full_name,
        phone_number,
        visit_type,
        purpose,
        check_in_method,
        submission_idempotency_key
    )
values (
        'f1000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111',
        'a1000000-0000-4000-8000-000000000001',
        'Visitor A',
        '+2348012345678',
        'business',
        'Test',
        'qr',
        'f1000000-0000-4000-8000-000000000011'
    ),
    (
        'f1000000-0000-4000-8000-000000000002',
        '11111111-1111-4111-8111-111111111111',
        'a1000000-0000-4000-8000-000000000002',
        'Visitor A2',
        '+2348012345678',
        'business',
        'Test',
        'qr',
        'f1000000-0000-4000-8000-000000000012'
    ),
    (
        'f2000000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222',
        'b2000000-0000-4000-8000-000000000001',
        'Visitor B',
        '+2348012345678',
        'business',
        'Test',
        'qr',
        'f2000000-0000-4000-8000-000000000011'
    );
insert into realtime.messages (topic, extension)
values (
        'tgm:location:a1000000-0000-4000-8000-000000000001',
        'broadcast'
    ),
    (
        'tgm:location:a1000000-0000-4000-8000-000000000002',
        'broadcast'
    ),
    (
        'tgm:location:b2000000-0000-4000-8000-000000000001',
        'broadcast'
    );
do $$
declare denied boolean;
begin denied := false;
begin
insert into public.staff (
        organization_id,
        location_id,
        department_id,
        full_name,
        email
    )
values (
        '11111111-1111-4111-8111-111111111111',
        'b2000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001',
        'Wrong branch',
        'wrong@test.example'
    );
exception
when foreign_key_violation then denied := true;
end;
if not denied then raise exception 'Cross-organization staff reference succeeded';
end if;
denied := false;
begin
update public.visits
set organization_id = '22222222-2222-4222-8222-222222222222'
where id = 'f1000000-0000-4000-8000-000000000001';
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Visit organization was mutable';
end if;
denied := false;
begin perform public.tgm_operator_visit_action(
    'c1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'cancel'
);
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Admin acted on another organization visit';
end if;
denied := false;
begin perform public.tgm_manage_operator(
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'deactivate'
);
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Admin changed another organization operator';
end if;
denied := false;
begin perform public.tgm_create_assisted_visit(
    'c1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    null,
    null,
    'Wrong visit',
    null,
    null,
    '+2348012345678',
    null,
    'business',
    'Test',
    gen_random_uuid()
);
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Admin created a visit in another organization';
end if;
denied := false;
begin perform public.tgm_prepare_host_email(
    'c1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    gen_random_uuid(),
    decode(repeat('aa', 32), 'hex')
);
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Admin prepared another organization host email';
end if;
denied := false;
begin perform public.tgm_create_public_visit(
    (
        select public_slug
        from public.locations
        where id = 'a1000000-0000-4000-8000-000000000001'
    ),
    'd2000000-0000-4000-8000-000000000001',
    null,
    'Wrong directory',
    null,
    null,
    '+2348012345678',
    null,
    'business',
    'Test',
    gen_random_uuid()
);
exception
when foreign_key_violation then denied := true;
end;
if not denied then raise exception 'Public check-in accepted another organization department';
end if;
end;
$$;
do $$
declare new_org uuid;
invite_hash bytea := decode(repeat('ab', 32), 'hex');
denied boolean;
begin new_org := public.tgm_register_organization(
    'c3000000-0000-4000-8000-000000000001',
    'New Customer'
);
if not exists (
    select 1
    from public.operator_profiles
    where user_id = 'c3000000-0000-4000-8000-000000000001'
        and organization_id = new_org
        and role = 'admin'
        and is_active
) then raise exception 'Founder was not made the first customer admin';
end if;
denied := false;
begin perform public.tgm_register_organization(
    'c3000000-0000-4000-8000-000000000001',
    'Another Customer'
);
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Founder created a second organization';
end if;
denied := false;
begin perform public.tgm_register_organization(
    'c3000000-0000-4000-8000-000000000003',
    'Platform Customer'
);
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Platform administrator joined a customer organization';
end if;
perform public.tgm_create_operator_invitation(
    'c1000000-0000-4000-8000-000000000001',
    'invitee@test.example',
    'receptionist',
    'a1000000-0000-4000-8000-000000000001',
    invite_hash
);
if public.tgm_accept_operator_invitation(
    'c3000000-0000-4000-8000-000000000002',
    invite_hash
) <> '11111111-1111-4111-8111-111111111111' then raise exception 'Invitation accepted into wrong organization';
end if;
if not exists (
    select 1
    from public.receptionist_location_assignments
    where user_id = 'c3000000-0000-4000-8000-000000000002'
        and organization_id = '11111111-1111-4111-8111-111111111111'
        and location_id = 'a1000000-0000-4000-8000-000000000001'
) then raise exception 'Invitation did not assign the branch';
end if;
denied := false;
begin perform public.tgm_create_operator_invitation(
    'c2000000-0000-4000-8000-000000000001',
    'invitee@test.example',
    'admin',
    null,
    decode(repeat('cd', 32), 'hex')
);
exception
when raise_exception then denied := true;
end;
if not denied then raise exception 'Another organization invited an attached account';
end if;
end;
$$;
set local role authenticated;
select set_config(
        'request.jwt.claim.sub',
        'c1000000-0000-4000-8000-000000000001',
        true
    );
do $$ begin if (
    select count(*)
    from public.visits
    where id in (
            'f1000000-0000-4000-8000-000000000001',
            'f1000000-0000-4000-8000-000000000002',
            'f2000000-0000-4000-8000-000000000001'
        )
) <> 2
or (
    select count(*)
    from public.locations
    where id in (
            'a1000000-0000-4000-8000-000000000001',
            'a1000000-0000-4000-8000-000000000002',
            'b2000000-0000-4000-8000-000000000001'
        )
) <> 2
or exists (
    select 1
    from public.staff
    where id = 'e2000000-0000-4000-8000-000000000001'
) then raise exception 'Customer admin RLS crossed organization boundary';
end if;
end;
$$;
select set_config(
        'request.jwt.claim.sub',
        'c1000000-0000-4000-8000-000000000002',
        true
    );
select set_config(
        'realtime.topic',
        'tgm:location:a1000000-0000-4000-8000-000000000001',
        true
    );
do $$ begin if (
    select count(*)
    from public.visits
    where id in (
            'f1000000-0000-4000-8000-000000000001',
            'f1000000-0000-4000-8000-000000000002',
            'f2000000-0000-4000-8000-000000000001'
        )
) <> 1
or (
    select count(*)
    from public.locations
    where id in (
            'a1000000-0000-4000-8000-000000000001',
            'a1000000-0000-4000-8000-000000000002',
            'b2000000-0000-4000-8000-000000000001'
        )
) <> 1
or not exists (
    select 1
    from realtime.messages
) then raise exception 'Receptionist RLS crossed branch boundary';
end if;
end;
$$;
select set_config(
        'realtime.topic',
        'tgm:location:b2000000-0000-4000-8000-000000000001',
        true
    );
do $$ begin if exists (
    select 1
    from realtime.messages
) then raise exception 'Receptionist could subscribe to another organization branch';
end if;
end;
$$;
select set_config(
        'realtime.topic',
        'tgm:location:a1000000-0000-4000-8000-000000000001',
        true
    );
reset role;
update public.receptionist_location_assignments
set location_id = 'a1000000-0000-4000-8000-000000000002'
where user_id = 'c1000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin if (
    select count(*)
    from public.visits
    where id in (
            'f1000000-0000-4000-8000-000000000001',
            'f1000000-0000-4000-8000-000000000002'
        )
) <> 1
or exists (
    select 1
    from public.visits
    where id = 'f1000000-0000-4000-8000-000000000001'
)
or (
    select count(*)
    from realtime.messages
) <> 0 then raise exception 'Reassigned receptionist retained old branch access';
end if;
end;
$$;
select set_config(
        'realtime.topic',
        'tgm:location:a1000000-0000-4000-8000-000000000002',
        true
    );
do $$ begin if not exists (
    select 1
    from realtime.messages
) then raise exception 'Reassigned receptionist cannot subscribe to new branch';
end if;
end;
$$;
reset role;
update public.operator_profiles
set is_active = false
where user_id = 'c1000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin if exists (
    select 1
    from public.visits
    where id in (
            'f1000000-0000-4000-8000-000000000001',
            'f1000000-0000-4000-8000-000000000002'
        )
)
or exists (
    select 1
    from public.locations
    where id in (
            'a1000000-0000-4000-8000-000000000001',
            'a1000000-0000-4000-8000-000000000002'
        )
) then raise exception 'Inactive receptionist retained branch access';
end if;
end;
$$;
select set_config(
        'request.jwt.claim.sub',
        'c3000000-0000-4000-8000-000000000003',
        true
    );
do $$ begin if exists (
    select 1
    from public.visits
)
or exists (
    select 1
    from public.locations
) then raise exception 'Platform administrator had default customer data access';
end if;
end;
$$;
reset role;
update public.organizations
set is_active = false
where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config(
        'request.jwt.claim.sub',
        'c1000000-0000-4000-8000-000000000001',
        true
    );
do $$ begin if exists (
    select 1
    from public.visits
)
or exists (
    select 1
    from public.locations
)
or exists (
    select 1
    from public.organizations
) then raise exception 'Inactive organization retained operator access';
end if;
end;
$$;
reset role;
rollback;