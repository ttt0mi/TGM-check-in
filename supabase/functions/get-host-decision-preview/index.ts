import { withSupabase } from "@supabase/server";
import { env, failure, HttpError, json, readJson, sha256Hex } from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";

export default {
	fetch: withSupabase<Database>({ auth: "none" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			const body = await readJson(req, 2048);
			const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
			const timeWindow = new Date(Math.floor(Date.now() / 300_000) * 300_000).toISOString();
			const keyHash = await sha256Hex(`${env("HOST_PREVIEW_RATE_SECRET")}:${ip}`);
			const service = ctx.supabaseAdmin;
			const { data: allowed, error: rateError } = await service.rpc("tgm_consume_public_rate_limit", {
				p_request_key_hash: `\\x${keyHash}`,
				p_window_start: timeWindow,
				p_limit: 30,
			});
			if (rateError) throw rateError;
			if (!allowed) throw new HttpError(429, "Please wait before trying this link again");
			if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/i.test(body.token))
				return json({ state: "invalid" });
			const hash = await sha256Hex(body.token);
			const { data, error } = await service.rpc("tgm_preview_host_decision", { p_token_hash: `\\x${hash}` });
			if (error) throw error;
			return json(data ?? { state: "invalid" });
		} catch (error) {
			return failure(error);
		}
	}),
};
