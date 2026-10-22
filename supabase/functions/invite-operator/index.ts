import { withSupabase } from "@supabase/server";
import {
	authenticatedOperator, failure, HttpError, json, readJson, requiredText,
	sha256Hex, uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import { emailPattern } from "../_shared/utilities.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			if (operator.role !== "admin") throw new HttpError(403, "Admin access required");
			const body = await readJson(req);
			const email = requiredText(body.email, "email", 254).toLowerCase();
			if (!emailPattern.test(email)) throw new HttpError(400, "Invalid email");
			const {role} = body;
			if (role !== "admin" && role !== "receptionist")
				throw new HttpError(400, "Invalid role");
			const locationId = role === "receptionist" ? uuid(body.location_id, "branch") : null;
			if (role === "admin" && body.location_id != null)
				throw new HttpError(400, "Admins cannot have a branch assignment");
			const token = Array.from(crypto.getRandomValues(new Uint8Array(32)),
				byte => byte.toString(16).padStart(2, "0")).join("");
			const hash = await sha256Hex(token);
			const { data, error } = await operator.service.rpc("tgm_create_operator_invitation", {
				p_actor_id: operator.userId,
				p_email: email,
				p_role: role,
				p_location_id: locationId,
				p_token_hash: `\\x${hash}`,
			});
			if (error) {
				if (["P0001", "23514", "23503"].includes(error.code))
					throw new HttpError(400, error.message);
				throw error;
			}
			// Delivery and redemption UI are part of the later frontend phase.
			return json({ invitation_id: data, token, expires_in_days: 7 }, 201);
		} catch (error) {
			return failure(error);
		}
	}),
};
