import { withSupabase } from "@supabase/server";
import {
	env,
	failure,
	HttpError,
	json,
	optionalText,
	readJson,
	requiredText,
	sha256Hex,
	uuid,
} from "../_shared/tgm.ts";
import type { Database } from "../_shared/database.ts";
import {
	emailPattern,
	isVisitType,
	phonePattern,
} from "../_shared/utilities.ts";


export default {
	fetch: withSupabase<Database>({ auth: "none" }, async (req, ctx) => {
		try {
			if (req.method !== "POST")
				return json({ error: "Method not allowed" }, 405);
			const body = await readJson(req);
			const location = uuid(body.location, "location QR");
			const idempotencyKey = uuid(body.idempotency_key, "idempotency key");
			const departmentId =
				body.department_id == null
					? null
					: uuid(body.department_id, "department");
			const staffId =
				body.staff_id == null ? null : uuid(body.staff_id, "host");
			const fullName = requiredText(body.visitor_full_name, "full name", 120);
			const preferredName = optionalText(
				body.visitor_preferred_name,
				"preferred name",
				80,
			);
			const email =
				optionalText(body.visitor_email, "email", 254)?.toLowerCase() || null;
			if (email && !emailPattern.test(email))
				throw new HttpError(400, "Invalid email");
			const phoneNumber = requiredText(body.phone_number, "phone number", 16);
			if (!phonePattern.test(phoneNumber))
				throw new HttpError(400, "Phone number must use international format");
			const organization = optionalText(body.organization, "organization", 120);
			const visitType = requiredText(body.visit_type, "visit type", 30);
			if (!isVisitType(visitType))
				throw new HttpError(400, "Invalid visit type");
			const purpose = requiredText(body.purpose, "purpose", 500);
			if (staffId && !departmentId)
				throw new HttpError(400, "Host requires a department");
			let visitorSessionTokenHash: string | null = null;
			if (body.visitor_session_token != null) {
				if (
					typeof body.visitor_session_token !== "string" ||
					!/^[A-Za-z0-9_-]{43}$/.test(body.visitor_session_token)
				) {
					throw new HttpError(400, "Invalid visitor session token");
				}
				visitorSessionTokenHash = `\\x${await sha256Hex(body.visitor_session_token)}`;
			}

			const service = ctx.supabaseAdmin;
			const submission = {
				p_public_slug: location,
				p_department_id: departmentId,
				p_staff_id: staffId,
				p_visitor_full_name: fullName,
				p_visitor_preferred_name: preferredName,
				p_visitor_email: email,
				p_phone_number: phoneNumber,
				p_organization: organization,
				p_visit_type: visitType,
				p_purpose: purpose,
				p_submission_idempotency_key: idempotencyKey,
				p_visitor_session_token_hash: visitorSessionTokenHash,
			};
			const { data: activeLocation, error: locationError } = await service
				.from("locations")
				.select("id,organization_id")
				.eq("public_slug", location)
				.eq("is_active", true)
				.maybeSingle();
			if (locationError) throw locationError;
			if (!activeLocation) throw new HttpError(400, "Location unavailable");
			const { data: activeOrganization, error: organizationError } = await service
				.from("organizations")
				.select("id")
				.eq("id", activeLocation.organization_id)
				.eq("is_active", true)
				.maybeSingle();
			if (organizationError) throw organizationError;
			if (!activeOrganization) throw new HttpError(400, "Location unavailable");
			// A matching completed request can be replayed without another CAPTCHA.
			const { data: existing, error: existingError } = await service.rpc(
				"tgm_public_visit_retry_matches", submission,
			);
			if (
				existingError?.code === "PT409" &&
				existingError.message === "Visitor session already has a visit"
			) {
				throw new HttpError(409, "Visitor session already has a visit");
			}
			if (existingError?.code === "PT409")
				throw new HttpError(409, "Idempotency key already used for a different request");
			if (existingError) throw existingError;
			if (existing) {
				return json({
					accepted: true,
					visitor_session_created: visitorSessionTokenHash !== null,
				}, 202);
			}

			const turnstileToken = requiredText(
				body.turnstile_token,
				"Turnstile token",
				2048,
			);
			const clientIp =
				req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
			const verification = new FormData();
			verification.set("secret", env("TURNSTILE_SECRET_KEY"));
			verification.set("response", turnstileToken);
			if (clientIp !== "unknown") verification.set("remoteip", clientIp);
			const verifyResponse = await fetch(
				"https://challenges.cloudflare.com/turnstile/v0/siteverify", {
					method: "POST",
					body: verification,
				},
			);
			if (!verifyResponse.ok)
				throw new HttpError(503, "Verification unavailable");
			const verdict = (await verifyResponse.json()) as {
				success?: boolean;
				hostname?: string;
			};
			if (!verdict.success) throw new HttpError(400, "Verification failed");
			const expectedHostname = env("TURNSTILE_ALLOWED_HOSTNAME");
			if (expectedHostname && verdict.hostname !== expectedHostname) {
				throw new HttpError(400, "Verification hostname mismatch");
			}

			// Do not create rate-limit rows for invalid tokens or arbitrary QR values.
			const timeWindow = new Date(
				Math.floor(Date.now() / 300_000) * 300_000,
			).toISOString();
			const hash = await sha256Hex(
				`${env("TURNSTILE_SECRET_KEY")}:${clientIp}:${activeLocation.id}`,
			);
			const { data: allowed, error: rateError } = await service.rpc(
				"tgm_consume_public_rate_limit", {
					p_request_key_hash: `\\x${hash}`,
					p_window_start: timeWindow,
					p_limit: 30,
				},
			);
			if (rateError) throw rateError;
			if (!allowed)
				throw new HttpError(429, "Please wait before submitting again");

			const { error: createError } = await service.rpc(
				"tgm_create_public_visit", submission,
			);
			if (createError) {
				if (
					createError.code === "PT409" &&
					createError.message === "Visitor session already has a visit"
				) {
					throw new HttpError(409, "Visitor session already has a visit");
				}
				if (createError.code === "PT409")
					throw new HttpError(409, "Idempotency key already used for a different request");
				if (["23503", "23514", "P0001"].includes(createError.code)) {
					throw new HttpError(
						400,
						"Location, department or host is unavailable",
					);
				}
				throw createError;
			}
			return json({
				accepted: true,
				visitor_session_created: visitorSessionTokenHash !== null,
			}, 202);
		} catch (error) {
			return failure(error);
		}
	}),
};
