import { withSupabase } from "@supabase/server";
import { failure, HttpError, json, readJson, sha256Hex } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			const actorId = ctx.userClaims?.id;
			if (!actorId) throw new HttpError(401, "Sign in required");
			const body = await readJson(req, 4096);
			if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/i.test(body.token))
				return json({ state: "invalid" });
			const hash = await sha256Hex(body.token);
			const { data, error } = await ctx.supabaseAdmin.rpc(
				"tgm_preview_operator_invitation" as never,
				{ p_actor_id: actorId, p_token_hash: `\\x${hash}` } as never,
			);
			if (error) throw error;
			const result = Array.isArray(data) ? data[0] : null;
			return json(result ?? { state: "invalid" });
		} catch (error) {
			return failure(error);
		}
	}),
};
