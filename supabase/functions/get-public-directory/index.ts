import { withSupabase } from "@supabase/server";
import { failure, json, uuid } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";


export default {
	fetch: withSupabase<Database>({ auth: "none" }, async (req, ctx) => {
		try {
			if (req.method !== "GET")
				return json({ error: "Method not allowed" }, 405);
			const query = new URL(req.url).searchParams;
			const slug = uuid(
				query.get("location"),
				"location QR",
			);
			const selectedDepartment = query.has("department") ? uuid(query.get("department"), "department") : null;
			const service = ctx.supabaseAdmin;
			const { data: location, error: locationError } = await service
				.from("locations")
				.select("id,organization_id,name,address,timezone")
				.eq("public_slug", slug)
				.eq("is_active", true)
				.maybeSingle();
			if (locationError) throw locationError;
			if (!location) return json({ error: "Location unavailable" }, 404);
			const { data: organization, error: organizationError } = await service
				.from("organizations")
				.select("id,name")
				.eq("id", location.organization_id)
				.eq("is_active", true)
				.maybeSingle();
			if (organizationError) throw organizationError;
			if (!organization) return json({ error: "Location unavailable" }, 404);

			const [noticeResult, departmentsResult] = await Promise.all([
				service.from("organization_privacy_notices")
					.select("notice_copy,policy_url,approved_at")
					.eq("organization_id", location.organization_id)
					.maybeSingle(),
				service
					.from("departments")
					.select("id,name")
					.eq("organization_id", location.organization_id)
					.eq("is_active", true)
					.order("name"),
			]);
			if (noticeResult.error) throw noticeResult.error;
			if (!noticeResult.data) return json({ error: "Public check-in is not configured" }, 412);
			if (departmentsResult.error) throw departmentsResult.error;
			const departments = departmentsResult.data || [];
			if (selectedDepartment && !departments.some(item => item.id === selectedDepartment))
				return json({ error: "Department unavailable" }, 404);
			const { data: staff, error: staffError } = selectedDepartment
				? await service.from("staff")
					.select("id,department_id,full_name,preferred_name")
					.eq("location_id", location.id)
					.eq("organization_id", location.organization_id)
					.eq("department_id", selectedDepartment)
					.eq("is_active", true)
					.order("full_name")
				: { data: [], error: null };
			if (staffError) throw staffError;
			const safeDepartments = departments.map(department => ({
					id: department.id,
					name: department.name,
					staff: (staff || [])
						.filter(member => member.department_id === department.id)
						.map(member => ({
							id: member.id,
							name: member.preferred_name || member.full_name,
						})),
				}));

			return json({
				organization: { name: organization.name },
				location: {
					name: location.name,
					address: location.address,
					timezone: location.timezone,
				},
				departments: safeDepartments,
				privacy_notice: noticeResult.data,
			});
		} catch (error) {
			return failure(error);
		}
	}),
};
