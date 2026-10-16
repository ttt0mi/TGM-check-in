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
	const body = await req.text();
	if (new TextEncoder().encode(body).length > maxBytes)
		throw new HttpError(413, "Request too large");
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
	) {
		super(message);
	}
}

export function failure(error: unknown): Response {
	if (error instanceof HttpError)
		return json({ error: error.message }, error.status);
	console.error("TGM Edge Function failed", error);
	return json({ error: "Server error" }, 500);
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
		.select("role,is_active")
		.eq("user_id", userId)
		.single();
	if (profileError || !profile?.is_active || !profile.role)
		throw new HttpError(403, "Operator access is inactive");
	let locationId: string | null = null;
	if (profile.role === "receptionist") {
		const { data: assignment, error } = await service
			.from("receptionist_location_assignments")
			.select("location_id,locations!inner(is_active)")
			.eq("user_id", userId)
			.single();
		if (
			error ||
			!assignment?.location_id ||
			!(assignment.locations as { is_active: boolean }).is_active
		) {
			throw new HttpError(403, "No active location assignment");
		}
		locationId = assignment.location_id;
	}
	return {
		service,
		userId,
		role: profile.role as "admin" | "receptionist",
		locationId,
	};
}

export function requireLocationAccess(
	operator: { role: string; locationId: string | null },
	locationId: string,
) {
	if (operator.role !== "admin" && operator.locationId !== locationId) {
		throw new HttpError(403, "Location access denied");
	}
}

export async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
	return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}
