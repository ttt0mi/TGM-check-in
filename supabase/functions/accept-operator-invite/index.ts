import { withSupabase } from "@supabase/server";
import { failure, HttpError, json, readJson, requiredText, sha256Hex } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			const actorId = ctx.userClaims?.id;
			if (!actorId) throw new HttpError(401, "Sign in required");
			const body = await readJson(req, 4096);
			const token = requiredText(body.token, "invitation token", 128);
			if (!/^[a-f0-9]{64}$/i.test(token)) throw new HttpError(400, "Invalid token");
			const hash = await sha256Hex(token);
			const { data, error } = await ctx.supabaseAdmin.rpc("tgm_accept_operator_invitation", {
				p_actor_id: actorId,
				p_token_hash: `\\x${hash}`,
			});
			if (error) {
				if (error.code === "P0001" || error.code === "23514")
					throw new HttpError(409, error.message);
				throw error;
			}
			return json({ organization_id: data });
		} catch (error) {
			return failure(error);
		}
	}),
};
