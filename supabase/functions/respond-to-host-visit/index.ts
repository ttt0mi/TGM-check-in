import { withSupabase } from "@supabase/server";
import {
	failure,
	HttpError,
	json,
	readJson,
	requiredText,
	sha256Hex,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";


export default {
	fetch: withSupabase<Database>({ auth: "none" }, async (req, ctx) => {
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const body = await readJson(req, 4096);
			const token = requiredText(body.token, "token", 128);
			if (!/^[a-f0-9]{64}$/i.test(token))
				throw new HttpError(400, "Invalid token");
			const { outcome } = body;
			if (outcome !== "approved" && outcome !== "declined")
				throw new HttpError(400, "Invalid decision");
			const hash = await sha256Hex(token);
			const service = ctx.supabaseAdmin;
			const { data, error } = await service.rpc("tgm_respond_to_host", {
				p_token_hash: `\\x${hash}`,
				p_outcome: outcome,
			});
			if (error) throw error;
			if (data === "expired_or_used")
				throw new HttpError(410, "This link has expired or was already used");
			return json({
				outcome: data,
				requires_reception_admission: data === "approved",
			});
		} catch (error) {
			return failure(error);
		}
	}),
};
