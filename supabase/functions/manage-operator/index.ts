import { withSupabase } from "@supabase/server";
import {
	authenticatedOperator,
	failure,
	HttpError,
	json,
	readJson,
	uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";


export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			if (operator.role !== "admin")
				throw new HttpError(403, "Admin access required");
			const body = await readJson(req);
			const targetId = uuid(body.user_id, "user");
			const { action } = body;
			if (action !== "assign" && action !== "deactivate")
				throw new HttpError(400, "Invalid action");
			let role: Database["public"]["Enums"]["tgm_operator_role"] | undefined;
			if (action === "assign") {
				const requestedRole = body.role;
				if (requestedRole !== "admin" && requestedRole !== "receptionist") {
					throw new HttpError(400, "Invalid role");
				}
				role = requestedRole;
			}
			const locationId =
				action === "assign" && role === "receptionist"
					? uuid(body.location_id, "reception location")
					: undefined;
			if (action === "assign" && role === "admin" && body.location_id != null) {
				throw new HttpError(400, "Admins cannot have a reception assignment");
			}

			// The live profile is the authorization source of truth. Do not change
			// Auth bans here: they cannot be committed atomically with this RPC.
			const args = {
					p_actor_id: operator.userId,
					p_target_id: targetId,
					p_action: action,
					...(role ? { p_role: role } : {}),
					...(locationId ? { p_location_id: locationId } : {}),
				};
			const { data, error } = await operator.service.rpc("tgm_manage_operator", args);
			if (error) {
				if (
					error.code === "P0001" ||
					error.code === "23503" ||
					error.code === "23514"
				) {
					throw new HttpError(400, error.message);
				}
				throw error;
			}
			return json({ profile: data });
		} catch (error) {
			return failure(error);
		}
	}),
};
