import { withSupabase } from "@supabase/server";
import {
	authenticatedOperator,
	failure,
	HttpError,
	json,
	readJson,
	uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import type { JsonObject } from "../_shared/tgm.ts";


const actions = new Set([
	"edit",
	"review",
	"admit",
	"checkout",
	"correct_checkout",
	"cancel",
]);

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			const body = await readJson(req);
			const visitId = uuid(body.visit_id, "visit");
			const { action } = body;
			if (typeof action !== "string" || !actions.has(action))
				throw new HttpError(400, "Invalid action");
			const patch = body.patch ?? {};
			if (!patch || typeof patch !== "object" || Array.isArray(patch))
				throw new HttpError(400, "Invalid changes");
			const { data, error } = await operator.service.rpc(
				"tgm_operator_visit_action", {
					p_actor_id: operator.userId,
					p_visit_id: visitId,
					p_action: action,
				p_patch: patch as JsonObject,
				},
			);
			if (error) {
				if (
					error.code === "P0001" ||
					error.code === "23514" ||
					error.code === "23503" ||
					error.code?.startsWith("22")
				) {
					throw new HttpError(400, error.message);
				}
				throw error;
			}
			return json({ visit: data });
		} catch (error) {
			return failure(error);
		}
	}),
};
