import { withSupabase } from "@supabase/server";
import { json } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req) => {
		if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
		return json({ available: Deno.env.get("TGM_ENABLE_ORGANIZATION_SIGNUP") === "true" });
	}),
};
