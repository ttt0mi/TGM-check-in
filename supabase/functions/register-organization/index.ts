import { withSupabase } from "@supabase/server";
import { failure, HttpError, json, readJson, requiredText } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			if (Deno.env.get("TGM_ENABLE_ORGANIZATION_SIGNUP") !== "true")
				throw new HttpError(503, "Organization signup is not enabled yet");
			const actorId = ctx.userClaims?.id;
			if (!actorId) throw new HttpError(401, "Sign in required");
			const body = await readJson(req);
			const name = requiredText(body.name, "organization name", 120);
			const { data, error } = await ctx.supabaseAdmin.rpc("tgm_register_organization", {
				p_actor_id: actorId,
				p_name: name,
			});
			if (error) {
				if (error.code === "P0001" || error.code === "23514")
					throw new HttpError(409, error.message);
				throw error;
			}
			return json({ organization_id: data }, 201);
		} catch (error) {
			return failure(error);
		}
	}),
};
