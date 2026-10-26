import type { SupabaseContext } from "@supabase/server";
import type { Database, Json } from "./database.ts";

export type JsonObject = { [key: string]: Json | undefined };

export function json(data: unknown, status = 200): Response {
	return Response.json(data, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}

export function env(name: string): string {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

export async function readJson(
	req: Request,
	maxBytes = 16_384,
): Promise<JsonObject> {
	const reader = req.body?.getReader();
	const decoder = new TextDecoder();
	let body = "";
	let size = 0;
	if (reader) {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > maxBytes) {
					await reader.cancel().catch(() => {});
					throw new HttpError(413, "Request too large");
				}
				body += decoder.decode(value, { stream: true });
			}
			body += decoder.decode();
		} finally {
			reader.releaseLock();
		}
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new HttpError(400, "Invalid JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new HttpError(400, "Expected a JSON object");
	return parsed as JsonObject;
}

export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
		public code?: string,
	) {
		super(message);
	}
}

export function logContext() {
	const read = (name: string) => { try { return Deno.env.get(name); } catch { return undefined; } };
	const environment = read("APP_ENV");
	const release = read("APP_RELEASE");
	return {
		environment: environment && /^(production|staging|development)$/.test(environment) ? environment : "unknown",
		release: release && /^[a-zA-Z0-9._-]{1,64}$/.test(release) ? release : "unknown",
	};
}

export function failure(error: unknown): Response {
	if (error instanceof HttpError)
		return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
	const correlationId = crypto.randomUUID();
	console.error(JSON.stringify({ event: "edge_failure", correlation_id: correlationId, category: "unexpected", ...logContext() }));
	return json({ error: "Server error", correlation_id: correlationId }, 500);
}

export function requiredText(
	value: unknown,
	label: string,
	maxLength: number,
): string {
	if (typeof value !== "string")
		throw new HttpError(400, `${label} is required`);
	const normalized = value.trim();
	if (!normalized || normalized.length > maxLength)
		throw new HttpError(400, `Invalid ${label}`);
	return normalized;
}

export function optionalText(
	value: unknown,
	label: string,
	maxLength: number,
): string | null {
	if (value == null || value === "") return null;
	if (typeof value !== "string") throw new HttpError(400, `Invalid ${label}`);
	const normalized = value.trim();
	if (normalized.length > maxLength)
		throw new HttpError(400, `Invalid ${label}`);
	return normalized || null;
}

export function uuid(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
	) {
		throw new HttpError(400, `Invalid ${label}`);
	}
	return value.toLowerCase();
}

export async function authenticatedOperator(ctx: SupabaseContext<Database>) {
	const userId = ctx.userClaims?.id;
	if (!userId) throw new HttpError(401, "Sign in required");
	const service = ctx.supabaseAdmin;
	const { data: profile, error: profileError } = await service
		.from("operator_profiles")
		.select("role,is_active,organization_id")
		.eq("user_id", userId)
		.single();
	if (profileError || !profile?.is_active || !profile.role || !profile.organization_id)
		throw new HttpError(403, "Operator access is inactive");
	const { data: organization, error: organizationError } = await service
		.from("organizations")
		.select("id")
		.eq("id", profile.organization_id)
		.eq("is_active", true)
		.maybeSingle();
	if (organizationError || !organization)
		throw new HttpError(403, "Organization access is inactive");
	let locationId: string | null = null;
	if (profile.role === "receptionist") {
		const { data: assignment, error } = await service
			.from("receptionist_location_assignments")
			.select("location_id")
			.eq("user_id", userId)
			.eq("organization_id", profile.organization_id)
			.single();
		if (error || !assignment?.location_id) {
			throw new HttpError(403, "No active location assignment");
		}
		const { data: location, error: locationError } = await service
			.from("locations")
			.select("id")
			.eq("id", assignment.location_id)
			.eq("organization_id", profile.organization_id)
			.eq("is_active", true)
			.maybeSingle();
		if (locationError || !location) {
			throw new HttpError(403, "No active location assignment");
		}
		locationId = assignment.location_id;
	}
	return {
		service,
		userId,
		organizationId: profile.organization_id,
		role: profile.role as "admin" | "receptionist",
		locationId,
	};
}

export async function requireLocationAccess(
	operator: {
        service: SupabaseContext<Database>["supabaseAdmin"];
        organizationId: string;
        role: string;
        locationId: string | null
    },
	locationId: string,
): Promise<void> {
	if (operator.role !== "admin" && operator.locationId !== locationId) {
		throw new HttpError(403, "Location access denied");
	}
	const { data: location, error } = await operator.service
		.from("locations")
		.select("id")
		.eq("id", locationId)
		.eq("organization_id", operator.organizationId)
		.eq("is_active", true)
		.maybeSingle();
	if (error || !location) {
		throw new HttpError(403, "Location access denied");
	}
}

export async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
	return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}
