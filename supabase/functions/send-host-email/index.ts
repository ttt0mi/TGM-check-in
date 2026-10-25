import { withSupabase } from "@supabase/server";
import {
	authenticatedOperator,
	env,
	failure,
	HttpError,
	json,
	readJson,
	sha256Hex,
	uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import { appOrigin } from "../_shared/app-origin.ts";
import { htmlEscape } from "../_shared/email-format.ts";
import { sendTransactionalEmail } from "../_shared/email-transport.ts";

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		let finalizeOnError: (() => Promise<void>) | null = null;
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			const body = await readJson(req);
			const visitId = uuid(body.visit_id, "visit");
			const { error: staleError } = await operator.service.rpc("tgm_mark_stale_host_email", {
				p_actor_id: operator.userId,
				p_visit_id: visitId,
			});
			if (staleError) {
				if (staleError.code === "P0001") throw new HttpError(403, "Location access denied");
				throw staleError;
			}

			// Missing deployment configuration must never create an attempt or send a
			// link to an unhosted page. This is intentionally fail-closed for launch.
			const origin = appOrigin();
			const apiKey = env("RESEND_API_KEY");
			const from = env("RESEND_FROM_EMAIL");
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))
				throw new Error("Invalid RESEND_FROM_EMAIL");

			const token = Array.from(
				crypto.getRandomValues(new Uint8Array(32)),
				byte => byte.toString(16).padStart(2, "0"),
			).join("");
			const tokenHash = await sha256Hex(token);
			const idempotencyKey = crypto.randomUUID();
			const { data: attemptId, error: prepareError } =
				await operator.service.rpc("tgm_prepare_host_email", {
					p_actor_id: operator.userId,
					p_visit_id: visitId,
					p_idempotency_key: idempotencyKey,
					p_token_hash: `\\x${tokenHash}`,
				});
			if (prepareError) {
				if (prepareError.code === "P0001")
					throw new HttpError(409, prepareError.message);
				throw prepareError;
			}
			let providerStatus: "sent" | "failed" | "unknown" = "failed";
			let providerId: string | null = null;
			let errorCode: string | null = "pre_send_failure";
			finalizeOnError = async () => {
				const { error } = await operator.service.rpc("tgm_finish_host_email", {
					p_attempt_id: attemptId,
					p_status: providerStatus,
					p_provider_message_id: providerId ?? undefined,
					p_error_code: errorCode ?? undefined,
				});
				if (error) console.error("Could not finalize email attempt", error);
			};
			const [visitResult, attemptResult] = await Promise.all([
				operator.service
					.from("visits")
					.select(
						"visitor_full_name,visit_type,purpose,arrived_at,location_id",
					)
					.eq("id", visitId)
					.eq("organization_id", operator.organizationId)
					.single(),
				operator.service
					.from("host_notification_attempts")
					.select("recipient_email")
					.eq("id", attemptId)
					.eq("visit_id", visitId)
					.single(),
			]);
			if (
				visitResult.error ||
				attemptResult.error ||
				!visitResult.data ||
				!attemptResult.data
			) {
				throw (
					visitResult.error ||
					attemptResult.error ||
					new Error("Prepared email data unavailable")
				);
			}
			const visit = visitResult.data;
			const { data: location, error: locationError } = await operator.service
				.from("locations")
				.select("timezone")
				.eq("id", visit.location_id)
				.eq("organization_id", operator.organizationId)
				.single();
			if (locationError || !location) {
				throw locationError || new Error("Prepared visit branch unavailable");
			}
			const arrival = new Intl.DateTimeFormat("en-NG", {
				timeZone: location.timezone,
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(visit.arrived_at));
			const decisionUrl = new URL("/host-decision", origin);
			decisionUrl.hash = new URLSearchParams({ token }).toString();
			const emailBody = {
				from,
				to: [attemptResult.data.recipient_email],
				subject: "A visitor is waiting for your decision",
				html:
					`<p>Visitor: ${htmlEscape(visit.visitor_full_name)}</p>` +
					`<p>Visit type: ${htmlEscape(visit.visit_type)}</p>` +
					`<p>Purpose: ${htmlEscape(visit.purpose)}</p>` +
					`<p>Arrival: ${htmlEscape(arrival)}</p>` +
					`<p><a href="${htmlEscape(decisionUrl.toString())}">Acknowledge or decline this visit</a></p>` +
					"<p>This single-use link expires at the end of the visit day. Reception must still admit the visitor after approval.</p>",
				text: `Visitor: ${visit.visitor_full_name}\nVisit type: ${visit.visit_type}\nPurpose: ${visit.purpose}\nArrival: ${arrival}\n\nAcknowledge or decline this visit: ${decisionUrl.toString()}\n\nThis single-use link expires at the end of the visit day. Reception must still admit the visitor after approval.`,
			};
			try {
				// Once the request starts, a timeout or server failure is ambiguous.
				providerStatus = "unknown";
				errorCode = "provider_outcome_unknown";
				const delivery = await sendTransactionalEmail(apiKey, emailBody, `tgm-host-${idempotencyKey}`);
				if (delivery.status === "sent") {
					providerStatus = "sent";
					providerId = delivery.providerId;
					errorCode = null;
				} else {
					errorCode = delivery.errorCode;
				}
			} catch {
				errorCode = "provider_outcome_unknown";
			}
			const { error: finishError } = await operator.service.rpc(
				"tgm_finish_host_email",
				{
					p_attempt_id: attemptId,
					p_status: providerStatus,
					p_provider_message_id: providerId ?? undefined,
					p_error_code: errorCode ?? undefined,
				},
			);
			if (finishError) throw finishError;
			finalizeOnError = null;
			if (providerStatus === "sent") return json({ status: "sent" });
			if (providerStatus === "failed")
				throw new HttpError(502, "Email failed; reception may retry");
			throw new HttpError(
				503,
				"Email outcome is uncertain; review before retrying",
			);
		} catch (error) {
			if (finalizeOnError) {
				try {
					await finalizeOnError();
				} catch (finalizeError) {
					console.error("Could not finalize email attempt", finalizeError);
				}
			}
			return failure(error);
		}
	}),
};
