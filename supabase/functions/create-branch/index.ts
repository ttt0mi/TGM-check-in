import { withSupabase } from "@supabase/server";
import { authenticatedOperator, failure, HttpError, json, readJson, requiredText } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			if (operator.role !== "admin") throw new HttpError(403, "Admin access required");
			const body = await readJson(req);
			const name = requiredText(body.name, "branch name", 120);
			if (body.address != null && typeof body.address !== "string")
				throw new HttpError(400, "Invalid address");
			const address = (body.address ?? "") as string;
			if (address.length > 240) throw new HttpError(400, "Invalid address");
			const timezone = requiredText(body.timezone, "timezone", 80);
			const { data, error } = await operator.service.rpc("tgm_create_branch", {
				p_actor_id: operator.userId,
				p_name: name,
				p_address: address,
				p_timezone: timezone,
			});
			if (error) {
				if (error.code === "P0001" || error.code === "23514")
					throw new HttpError(400, error.message);
				throw error;
			}
			return json({ location_id: data }, 201);
		} catch (error) {
			return failure(error);
		}
	}),
};
