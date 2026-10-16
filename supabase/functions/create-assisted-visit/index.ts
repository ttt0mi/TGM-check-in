import { withSupabase } from "@supabase/server";
import {
	authenticatedOperator,
	failure,
	HttpError,
	json,
	optionalText,
	readJson,
	requiredText,
	requireLocationAccess,
	uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import {
	emailPattern,
	isVisitType,
	phonePattern,
} from "../_shared/utilities.ts";


export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			const body = await readJson(req);
			const locationId = uuid(body.location_id, "location");
			requireLocationAccess(operator, locationId);
			const departmentId =
				body.department_id == null
					? null
					: uuid(body.department_id, "department");
			const staffId =
				body.staff_id == null ? null : uuid(body.staff_id, "host");
			if (staffId && !departmentId)
				throw new HttpError(400, "Host requires a department");
			const fullName = requiredText(body.visitor_full_name, "full name", 120);
			const preferredName = optionalText(
				body.visitor_preferred_name,
				"preferred name",
				80,
			);
			const email =
				optionalText(body.visitor_email, "email", 254)?.toLowerCase() || null;
			if (email && !emailPattern.test(email))
				throw new HttpError(400, "Invalid email");
			const phoneNumber = requiredText(body.phone_number, "phone number", 16);
			if (!phonePattern.test(phoneNumber))
				throw new HttpError(400, "Phone number must use international format");
			const organization = optionalText(body.organization, "organization", 120);
			const visitType = requiredText(body.visit_type, "visit type", 30);
			if (!isVisitType(visitType))
				throw new HttpError(400, "Invalid visit type");
			const purpose = requiredText(body.purpose, "purpose", 500);
			const { data: visitId, error } = await operator.service.rpc(
				"tgm_create_assisted_visit", {
					p_actor_id: operator.userId,
					p_location_id: locationId,
					p_department_id: departmentId,
					p_staff_id: staffId,
					p_visitor_full_name: fullName,
					p_visitor_preferred_name: preferredName,
					p_visitor_email: email,
					p_phone_number: phoneNumber,
					p_organization: organization,
					p_visit_type: visitType,
					p_purpose: purpose,
				},
			);
			if (error) {
				if (
					error.code === "P0001" ||
					error.code === "23514" ||
					error.code === "23503"
				) {
					throw new HttpError(400, error.message);
				}
				throw error;
			}
			return json({ visit_id: visitId }, 201);
		} catch (error) {
			return failure(error);
		}
	}),
};
