-- verify the service-only operator directory RPC remains tenant-scoped,
-- admin-authorized, searchable and stable across keyset pages.
-- run only on a migrated local or disposable database. the transaction rolls back.
begin;

insert into public.organizations (id, name, slug)
values
	('ae000000-0000-4000-8000-000000000001', 'Operator Page A', 'operator-page-a-test'),
	('ae000000-0000-4000-8000-000000000002', 'Operator Page B', 'operator-page-b-test');

insert into public.locations (id, organization_id, name)
values (
	'ae000000-0000-4000-8000-000000000010',
	'ae000000-0000-4000-8000-000000000001',
	'Operator Page Branch'
);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
values
	('ae000000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'page-admin-a@test.example', now(), 'test'),
	('ae000000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'page-admin-b@test.example', now(), 'test'),
	('ae000000-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'special-receptionist@test.example', now(), 'test'),
	('ae000000-0000-4000-8000-000000000104', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'inactive-page-admin@test.example', now(), 'test');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password)
select
	('ae100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
	'00000000-0000-0000-0000-000000000000'::uuid,
	'authenticated',
	'authenticated',
	case when n = 17 then 'special-operator@test.example'
		else 'page-operator-' || lpad(n::text, 2, '0') || '@test.example' end,
	now(),
	'test'
from generate_series(1, 30) as n;

update public.operator_profiles
set organization_id = 'ae000000-0000-4000-8000-000000000001', role = 'admin', is_active = true
where user_id = 'ae000000-0000-4000-8000-000000000101';

update public.operator_profiles
set organization_id = 'ae000000-0000-4000-8000-000000000002', role = 'admin', is_active = true
where user_id = 'ae000000-0000-4000-8000-000000000102';

update public.operator_profiles
set organization_id = 'ae000000-0000-4000-8000-000000000001', role = 'receptionist', is_active = true
where user_id = 'ae000000-0000-4000-8000-000000000103';

insert into public.receptionist_location_assignments (user_id, organization_id, location_id)
values (
	'ae000000-0000-4000-8000-000000000103',
	'ae000000-0000-4000-8000-000000000001',
	'ae000000-0000-4000-8000-000000000010'
);

update public.operator_profiles
set organization_id = 'ae000000-0000-4000-8000-000000000001', role = 'admin', is_active = false
where user_id = 'ae000000-0000-4000-8000-000000000104';

update public.operator_profiles
set organization_id = 'ae000000-0000-4000-8000-000000000001', role = 'admin', is_active = true
where user_id::text like 'ae100000-0000-4000-8000-%';

do $$
declare
	admin_a constant uuid := 'ae000000-0000-4000-8000-000000000101';
	admin_b constant uuid := 'ae000000-0000-4000-8000-000000000102';
	receptionist constant uuid := 'ae000000-0000-4000-8000-000000000103';
	inactive_admin constant uuid := 'ae000000-0000-4000-8000-000000000104';
	cursor_email text;
	cursor_id uuid;
	previous_email text;
	previous_id uuid;
	current_row record;
	denied boolean;
	invalid boolean;
begin
	if has_function_privilege('anon', 'public.tgm_list_organization_operators_page(uuid,integer,text,text,uuid)', 'execute')
		or has_function_privilege('authenticated', 'public.tgm_list_organization_operators_page(uuid,integer,text,text,uuid)', 'execute')
		or not has_function_privilege('service_role', 'public.tgm_list_organization_operators_page(uuid,integer,text,text,uuid)', 'execute') then
		raise exception 'Operator page execute grants are too broad or omit service_role';
	end if;

	if (select count(*) from public.tgm_list_organization_operators_page(admin_a, p_limit => 51)) <> 33 then
		raise exception 'Admin did not receive every operator in their organization';
	end if;
	if (select count(*) from public.tgm_list_organization_operators_page(admin_b, p_limit => 51)) <> 1 then
		raise exception 'Operator directory crossed organization boundaries';
	end if;
	if exists (
		select 1 from public.tgm_list_organization_operators_page(admin_a, p_limit => 51)
		where email = 'page-admin-b@test.example'
	) then
		raise exception 'Other organization operator leaked into the page';
	end if;

	if not exists (
		select 1 from public.tgm_list_organization_operators_page(admin_a, p_limit => 51)
		where user_id = receptionist and role = 'receptionist'
			and location_id = 'ae000000-0000-4000-8000-000000000010'
	) then
		raise exception 'Receptionist branch assignment is missing';
	end if;
	if not exists (
		select 1 from public.tgm_list_organization_operators_page(admin_a, p_limit => 51)
		where user_id = inactive_admin and not is_active
	) then
		raise exception 'Inactive operator is missing from access management';
	end if;

	if (select count(*) from public.tgm_list_organization_operators_page(
		admin_a, p_limit => 51, p_search => '  SPECIAL  ')) <> 2 then
		raise exception 'Case-insensitive trimmed operator search is incorrect';
	end if;
	if (select count(*) from public.tgm_list_organization_operators_page(
		admin_a, p_limit => 51, p_search => 'missing-operator')) <> 0 then
		raise exception 'Operator search returned an unrelated record';
	end if;

	for current_row in
		select * from public.tgm_list_organization_operators_page(admin_a, p_limit => 51)
	loop
		if previous_email is not null
			and (lower(current_row.email), current_row.user_id) <= (previous_email, previous_id) then
			raise exception 'Operator page order is not deterministic';
		end if;
		previous_email := lower(current_row.email);
		previous_id := current_row.user_id;
	end loop;

	select page.email, page.user_id into cursor_email, cursor_id
	from public.tgm_list_organization_operators_page(admin_a, p_limit => 10) page
	order by lower(page.email), page.user_id
	limit 1 offset 9;

	if (select count(*) from public.tgm_list_organization_operators_page(admin_a, p_limit => 10)) <> 10
		or (select count(*) from public.tgm_list_organization_operators_page(
			admin_a, p_limit => 51, p_after_email => cursor_email, p_after_id => cursor_id)) <> 23 then
		raise exception 'Operator keyset pagination lost records';
	end if;
	if exists (
		select first_page.user_id
		from public.tgm_list_organization_operators_page(admin_a, p_limit => 10) first_page
		intersect
		select next_page.user_id
		from public.tgm_list_organization_operators_page(
			admin_a, p_limit => 51, p_after_email => cursor_email, p_after_id => cursor_id) next_page
	) then
		raise exception 'Operator keyset pages overlap';
	end if;

	denied := false;
	begin
		perform public.tgm_list_organization_operators_page(receptionist);
	exception when sqlstate '42501' then denied := true;
	end;
	if not denied then raise exception 'Receptionist could list the operator directory'; end if;

	denied := false;
	begin
		perform public.tgm_list_organization_operators_page(inactive_admin);
	exception when sqlstate '42501' then denied := true;
	end;
	if not denied then raise exception 'Inactive admin could list the operator directory'; end if;

	invalid := false;
	begin
		perform public.tgm_list_organization_operators_page(admin_a, p_limit => 0);
	exception when sqlstate '22023' then invalid := true;
	end;
	if not invalid then raise exception 'Zero page limit was accepted'; end if;

	invalid := false;
	begin
		perform public.tgm_list_organization_operators_page(admin_a, p_limit => 52);
	exception when sqlstate '22023' then invalid := true;
	end;
	if not invalid then raise exception 'Oversized page limit was accepted'; end if;

	invalid := false;
	begin
		perform public.tgm_list_organization_operators_page(admin_a, p_search => repeat('x', 121));
	exception when sqlstate '22023' then invalid := true;
	end;
	if not invalid then raise exception 'Oversized operator search was accepted'; end if;

	invalid := false;
	begin
		perform public.tgm_list_organization_operators_page(admin_a, p_after_email => cursor_email);
	exception when sqlstate '22023' then invalid := true;
	end;
	if not invalid then raise exception 'Partial operator cursor was accepted'; end if;
end;
$$;

rollback;
