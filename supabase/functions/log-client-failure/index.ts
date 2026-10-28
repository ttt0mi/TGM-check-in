import { withSupabase } from "@supabase/server";
import { env, failure, json, logContext, readJson, sha256Hex } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import { validateDiagnostic } from "./validation.ts";

export default {
	fetch: withSupabase<Database>({ auth: "none" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			const body = await readJson(req, 512);
			const { area, kind, correlationId } = validateDiagnostic(body);
			const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
			const windowStart = new Date(Math.floor(Date.now() / 300_000) * 300_000).toISOString();
			const hash = await sha256Hex(`${env("CLIENT_DIAGNOSTICS_RATE_SECRET")}:client-failure:${ip}`);
			const { data: allowed, error } = await ctx.supabaseAdmin.rpc("tgm_consume_public_rate_limit", {
				p_request_key_hash: `\\x${hash}`,
				p_window_start: windowStart,
				p_limit: 20,
			});
			if (error) throw error;
			if (!allowed) return json({ accepted: false }, 429);
			console.error(JSON.stringify({
				event: "client_failure",
				correlation_id: correlationId,
				area,
				kind,
				...logContext(),
			}));
			return json({ accepted: true });
		} catch (error) {
			return failure(error);
		}
	}),
};
