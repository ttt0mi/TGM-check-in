import { withSupabase } from "@supabase/server";
import {
	failure,
	HttpError,
	json,
	readJson,
	sha256Hex,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
	fetch: withSupabase<Database>({ auth: "none" }, async (req, ctx) => {
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const body = await readJson(req);
			if (
				typeof body.token !== "string" ||
				!/^[A-Za-z0-9_-]{43}$/.test(body.token)
			) {
				throw new HttpError(404, "Visit unavailable");
			}
			const tokenHash = `\\x${await sha256Hex(body.token)}`;
			const { data, error } = await ctx.supabaseAdmin.rpc(
				"tgm_get_visitor_visit",
				{ p_token_hash: tokenHash },
			);
			if (error) throw error;
			const visit = data?.[0];
			if (!visit) throw new HttpError(404, "Visit unavailable");
			return json({ visit });
		} catch (error) {
			return failure(error);
		}
	}),
};
