-- Run against a migrated test database, never against production.
begin;
do $$
declare slug uuid := gen_random_uuid();
other_slug uuid := gen_random_uuid();
tenant_id uuid := gen_random_uuid();
key uuid := gen_random_uuid();
first_visit uuid;
repeated_visit uuid;
differs boolean;
field integer;
begin
insert into public.organizations (id, name, slug)
values (
        tenant_id,
        'Retry test',
        'retry-' || substr(replace(tenant_id::text, '-', ''), 1, 12)
    );
insert into public.locations (organization_id, public_slug, name)
values (tenant_id, slug, 'Retry test'),
    (tenant_id, other_slug, 'Other test');
if public.tgm_public_visit_retry_matches(
    slug,
    null,
    null,
    'Alice',
    null,
    'alice@example.com',
    '+2348012345678',
    null,
    'business',
    'Meeting',
    key
) then raise exception 'New key unexpectedly matched';
end if;
first_visit := public.tgm_create_public_visit(
    slug,
    null,
    null,
    'Alice',
    null,
    'alice@example.com',
    '+2348012345678',
    null,
    'business',
    'Meeting',
    key
);
repeated_visit := public.tgm_create_public_visit(
    slug,
    null,
    null,
    ' Alice ',
    null,
    'ALICE@EXAMPLE.COM',
    '+2348012345678',
    null,
    'business',
    'Meeting',
    key
);
if first_visit <> repeated_visit
or not public.tgm_public_visit_retry_matches(
    slug,
    null,
    null,
    'Alice',
    null,
    'alice@example.com',
    '+2348012345678',
    null,
    'business',
    'Meeting',
    key
) then raise exception 'Identical retry did not match';
end if;
if (
    select count(*)
    from public.visit_events
    where visit_id = first_visit
        and event_type = 'created'
) <> 1 then raise exception 'Retry duplicated the creation event';
end if;
-- Exercise each request field, including null-to-value changes.
for field in 1..10 loop differs := false;
begin perform public.tgm_public_visit_retry_matches(
    case
        when field = 1 then other_slug
        else slug
    end,
    case
        when field = 2 then gen_random_uuid()
        else null
    end,
    case
        when field = 3 then gen_random_uuid()
        else null
    end,
    case
        when field = 4 then 'Bob'
        else 'Alice'
    end,
    case
        when field = 5 then 'Al'
        else null
    end,
    case
        when field = 6 then 'bob@example.com'
        else 'alice@example.com'
    end,
    case
        when field = 7 then '+2348012345679'
        else '+2348012345678'
    end,
    case
        when field = 8 then 'Company'
        else null
    end,
    case
        when field = 9 then 'other'::public.tgm_visit_type
        else 'business'::public.tgm_visit_type
    end,
    case
        when field = 10 then 'Another meeting'
        else 'Meeting'
    end,
    key
);
exception
when sqlstate 'PT409' then differs := true;
end;
if not differs then raise exception 'Changed field % did not conflict',
field;
end if;
end loop;
differs := false;
begin perform public.tgm_create_public_visit(
    other_slug,
    null,
    null,
    'Alice',
    null,
    'alice@example.com',
    '+2348012345678',
    null,
    'business',
    'Meeting',
    key
);
exception
when sqlstate 'PT409' then differs := true;
end;
if not differs then raise exception 'Create path did not reject a conflicting key';
end if;
if has_function_privilege(
    'anon',
    'public.tgm_public_visit_retry_matches(uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid)',
    'execute'
)
or has_function_privilege(
    'authenticated',
    'public.tgm_public_visit_retry_matches(uuid,uuid,uuid,text,text,text,text,text,public.tgm_visit_type,text,uuid)',
    'execute'
) then raise exception 'Retry RPC is exposed to client roles';
end if;
update public.organizations
set is_active = false
where id = tenant_id;
differs := false;
begin perform public.tgm_public_visit_retry_matches(
    slug,
    null,
    null,
    'Alice',
    null,
    'alice@example.com',
    '+2348012345678',
    null,
    'business',
    'Meeting',
    key
);
exception
when others then differs := true;
end;
if not differs then raise exception 'Retry accepted an inactive organization';
end if;
end;
$$;
rollback;
