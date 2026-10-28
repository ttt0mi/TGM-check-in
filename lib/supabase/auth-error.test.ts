import { describe, expect, it } from "vitest";
import { AuthSessionMissingError, createClient } from "@supabase/supabase-js";
import { authTransportError, verifiedUser } from "./auth-error";
import { AUTH_CANCELLED_MARKER, AUTH_TIMEOUT_MARKER } from "./transport";

describe("installed Supabase Auth fetch error shape", () => {
	it.each([
		[AUTH_TIMEOUT_MARKER, "timeout"],
		[AUTH_CANCELLED_MARKER, "cancelled"],
	])("keeps %s distinguishable after Auth wraps fetch", async (marker, kind) => {
		const client = createClient("https://example.test", "public-key", {
			global: {
				fetch: async () => {
					throw new Error(marker);
				},
			},
			auth: { persistSession: false, autoRefreshToken: false, storageKey: `test-${marker}` },
		});
		const { error } = await client.auth.signInWithPassword({ email: "test@example.test", password: "password" });
		expect(authTransportError(error)?.kind).toBe(kind);
	});
	it("does not classify a general network failure as timeout", async () => {
		const client = createClient("https://example.test", "public-key", {
			global: {
				fetch: async () => {
					throw new TypeError("connection refused");
				},
			},
			auth: { persistSession: false, autoRefreshToken: false, storageKey: "test-network" },
		});
		const { error } = await client.auth.signInWithPassword({ email: "test@example.test", password: "password" });
		expect(authTransportError(error)?.kind).toBe("unavailable");
	});
	it("a getUser timeout fails closed rather than appearing anonymous", async () => {
		await expect(
			verifiedUser({
				auth: {
					getUser: async () => ({
						data: { user: null },
						error: Object.assign(new Error(AUTH_TIMEOUT_MARKER), { status: 0 }),
					}),
				},
			} as never),
		).rejects.toMatchObject({ kind: "timeout" });
	});
	it("a definite missing session remains anonymous", async () => {
		const user = await verifiedUser({
			auth: { getUser: async () => ({ data: { user: null }, error: new AuthSessionMissingError() }) },
		} as never);
		expect(user).toBeNull();
	});
});
