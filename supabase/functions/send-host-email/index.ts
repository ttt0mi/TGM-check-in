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

function safeOrigin(): string {
	const url = new URL(env("HOST_DECISION_ORIGIN"));
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== "/"
	) {
		throw new Error("HOST_DECISION_ORIGIN must be an HTTPS origin");
	}
	return url.origin;
}

function htmlEscape(value: string): string {
	return value.replace(
		/[&<>"']/g,
		character => ({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[character]!,
	);
}

export default {
	fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const operator = await authenticatedOperator(ctx);
			const body = await readJson(req);
			const visitId = uuid(body.visit_id, "visit");

			// Missing deployment configuration must never create an attempt or send a
			// link to an unhosted page. This is intentionally fail-closed for launch.
			const origin = safeOrigin();
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
			const [visitResult, attemptResult] = await Promise.all([
				operator.service
					.from("visits")
					.select(
						"visitor_full_name,visit_type,purpose,arrived_at,locations(timezone)",
					)
					.eq("id", visitId)
					.single(),
				operator.service
					.from("host_notification_attempts")
					.select("recipient_email")
					.eq("id", attemptId)
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
			const location = visit.locations as unknown as { timezone: string };
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
			};
			let providerStatus: "sent" | "failed" | "unknown" = "unknown";
			let providerId: string | null = null;
			let errorCode: string | null = null;
			try {
				const response = await fetch("https://api.resend.com/emails", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
						"Idempotency-Key": `tgm-host-${idempotencyKey}`,
					},
					body: JSON.stringify(emailBody),
				});
				const result = (await response.json()) as { id?: string };
				if (response.ok && result.id) {
					providerStatus = "sent";
					providerId = result.id;
				} else {
					providerStatus = "failed";
					errorCode = `resend_http_${response.status}`;
				}
			} catch (error) {
				console.error("Resend request outcome unknown", error);
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
			if (providerStatus === "sent") return json({ status: "sent" });
			if (providerStatus === "failed")
				throw new HttpError(502, "Email failed; reception may retry");
			throw new HttpError(
				503,
				"Email outcome is uncertain; review before retrying",
			);
		} catch (error) {
			return failure(error);
		}
	}),
};
