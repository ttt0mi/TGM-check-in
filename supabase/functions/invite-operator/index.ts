import { withSupabase } from "@supabase/server";
import {
	authenticatedOperator, failure, HttpError, json, readJson, requiredText,
	sha256Hex, uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import { emailPattern } from "../_shared/utilities.ts";
import { invitationEmailConfig, sendInvitationEmail } from "../_shared/invitation-email.ts";

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
			const emailConfig = invitationEmailConfig();
			const { data: organization, error: organizationError } = await operator.service
				.from("organizations").select("name")
				.eq("id", operator.organizationId).single();
			if (organizationError || !organization) throw organizationError || new Error("Organization unavailable");
			let branchName: string | null = null;
			if (locationId) {
				const { data: branch, error: branchError } = await operator.service
					.from("locations").select("name")
					.eq("id", locationId).eq("organization_id", operator.organizationId).eq("is_active", true).single();
				if (branchError || !branch) throw new HttpError(400, "Branch unavailable");
				branchName = branch.name;
			}
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
					throw new HttpError(409, "Invitation conflicts with an existing account or invitation", "invitation_conflict");
				throw error;
			}
			let status: "sent" | "unknown" = "unknown";
			let providerId: string | null = null;
			let errorCode = "provider_outcome_unknown";
			try {
				const delivery = await sendInvitationEmail(emailConfig, {
					invitationId: data, token, email, organization: organization.name,
					role, branch: branchName,
				});
				status = delivery.status;
				if (delivery.status === "sent") providerId = delivery.providerId;
				else errorCode = delivery.errorCode;
			} catch { /* A formatting failure after token creation remains unknown. */ }
			const { error: deliveryError } = await operator.service.rpc(
				"tgm_mark_operator_invitation_delivery",
				{ p_invitation_id: data, p_status: status, p_provider_id: providerId ?? undefined,
					p_error: status === "unknown" ? errorCode : undefined },
			);
			if (deliveryError) throw deliveryError;
			if (status !== "sent") throw new HttpError(503, "Invitation created; email outcome is uncertain. Review before resending.");
			return json({ invitation_id: data, delivery_status: status, expires_in_days: 7 }, 201);
		} catch (error) {
			return failure(error);
		}
	}),
};
