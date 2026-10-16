import { withSupabase } from "@supabase/server";
import { failure, json, uuid } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";


export default {
	fetch: withSupabase<Database>({ auth: "none" }, async (req, ctx) => {
		try {
			if (req.method !== "GET")
				return json({ error: "Method not allowed" }, 405);
			const slug = uuid(
				new URL(req.url).searchParams.get("location"),
				"location QR",
			);
			const service = ctx.supabaseAdmin;
			const { data: location, error: locationError } = await service
				.from("locations")
				.select("id,name,address,timezone")
				.eq("public_slug", slug)
				.eq("is_active", true)
				.maybeSingle();
			if (locationError) throw locationError;
			if (!location) return json({ error: "Location unavailable" }, 404);

			const [departmentsResult, staffResult] = await Promise.all([
				service
					.from("departments")
					.select("id,name")
					.eq("is_active", true)
					.order("name"),
				service
					.from("staff")
					.select("id,department_id,full_name,preferred_name")
					.eq("location_id", location.id)
					.eq("is_active", true)
					.order("full_name"),
			]);
			if (departmentsResult.error) throw departmentsResult.error;
			if (staffResult.error) throw staffResult.error;

			const staff = staffResult.data || [];
			const activeDepartmentIds = new Set(
				staff.map(member => member.department_id),
			);
			const departments = (departmentsResult.data || [])
				.filter(department => activeDepartmentIds.has(department.id))
				.map(department => ({
					id: department.id,
					name: department.name,
					staff: staff
						.filter(member => member.department_id === department.id)
						.map(member => ({
							id: member.id,
							name: member.preferred_name || member.full_name,
						})),
				}));

			return json({
				location: {
					name: location.name,
					address: location.address,
					timezone: location.timezone,
				},
				departments,
			});
		} catch (error) {
			return failure(error);
		}
	}),
};
