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
			const tokenHash = `\\x${hash}`;
			const { data: previews, error: previewError } = await ctx.supabaseAdmin.rpc(
				"tgm_preview_operator_invitation",
				{ p_actor_id: actorId, p_token_hash: tokenHash },
			);
			if (previewError) throw previewError;
			const preview = previews?.[0];
			if (preview?.state !== "active") {
				const code = preview?.state === "expired" ? "invitation_expired"
					: preview?.state === "accepted" ? "invitation_used"
					: preview?.state === "unavailable" ? "invitation_unavailable" : "invitation_invalid";
				throw new HttpError(410, "Invitation is no longer available", code);
			}
			const { data: account, error: accountError } = await ctx.supabaseAdmin.auth.admin.getUserById(actorId);
			if (accountError) throw accountError;
			if (preview.invited_email?.toLowerCase() !== account.user.email?.toLowerCase())
				throw new HttpError(403, "Sign in with the invited email address", "invitation_wrong_email");
			const { data, error } = await ctx.supabaseAdmin.rpc("tgm_accept_operator_invitation", {
				p_actor_id: actorId,
				p_token_hash: tokenHash,
			});
			if (error) {
				if (error.code === "P0001" || error.code === "23514")
					throw new HttpError(409, "Invitation state changed. Refresh its details", "invitation_conflict");
				throw error;
			}
			return json({ organization_id: data });
		} catch (error) {
			return failure(error);
		}
	}),
};
