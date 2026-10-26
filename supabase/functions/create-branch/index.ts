import { withSupabase } from "@supabase/server";
import { authenticatedOperator, failure, HttpError, json, readJson } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import { parseBranchDetails } from "./validation.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			if (operator.role !== "admin") throw new HttpError(403, "Admin access required");
			const body = await readJson(req);
			const { name, address, timezone } = parseBranchDetails(body);
			const { data, error } = await operator.service.rpc("tgm_create_branch", {
				p_actor_id: operator.userId,
				p_name: name,
				p_address: address,
				p_timezone: timezone,
			});
			if (error) {
				if (error.code === "P0001" || error.code === "23514")
					throw new HttpError(400, "Branch details are invalid or already in use", "branch_invalid");
				throw error;
			}
			return json({ location_id: data }, 201);
		} catch (error) {
			return failure(error);
		}
	}),
};
