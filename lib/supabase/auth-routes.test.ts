import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as recover } from "@/app/api/auth/recover/route";
import { POST as updatePassword } from "@/app/api/auth/reset-password/route";
import { GET as callback } from "@/app/auth/callback/route";
import { AUTH_TIMEOUT_MARKER } from "@/lib/supabase/transport";

const { createClient, verifyOtp, getUser, updateUser, exchangeCodeForSession } = vi.hoisted(() => ({
	createClient: vi.fn(),
	verifyOtp: vi.fn(),
	getUser: vi.fn(),
	updateUser: vi.fn(),
	exchangeCodeForSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/http/same-origin", () => ({ isSameOriginPost: () => true }));
vi.mock("@/lib/feature-flags", () => ({ frontendEnabled: () => true }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "signed-intent" }) }) }));
vi.mock("@/lib/auth/recovery-intent", () => ({
	createRecoveryIntent: () => "signed-intent",
	recoveryCookie: "recovery-intent",
	recoveryCookieOptions: { httpOnly: true },
	validRecoveryIntent: () => true,
}));

afterEach(() => {
	vi.clearAllMocks();
});

function request(body: object) {
	return { json: async () => body } as never;
}

it("recovery OTP timeout returns 503 without setting intent cookie", async () => {
	createClient.mockResolvedValue({ auth: { verifyOtp } });
	verifyOtp.mockResolvedValue({ data: { user: null }, error: new Error(AUTH_TIMEOUT_MARKER) });
	const response = await recover(request({ token_hash: "a".repeat(64) }));
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({ error: "auth_timeout" });
	expect(response.headers.get("set-cookie")).toBeNull();
});

it("successful recovery establishes the intent only after verified OTP", async () => {
	createClient.mockResolvedValue({ auth: { verifyOtp } });
	verifyOtp.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
	const response = await recover(request({ token_hash: "a".repeat(64) }));
	expect(response.status).toBe(200);
	expect(response.headers.get("set-cookie")).toContain("recovery-intent=signed-intent");
});

it("password update does not run when identity verification times out", async () => {
	createClient.mockResolvedValue({ auth: { getUser, updateUser } });
	getUser.mockResolvedValue({ data: { user: null }, error: new Error(AUTH_TIMEOUT_MARKER) });
	const response = await updatePassword(request({ password: "StrongPassword1!" }));
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({ error: "auth_timeout" });
	expect(updateUser).not.toHaveBeenCalled();
});

it("an uncertain password update preserves the recovery cookie for deliberate review", async () => {
	createClient.mockResolvedValue({ auth: { getUser, updateUser } });
	getUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
	updateUser.mockResolvedValue({ error: new Error(AUTH_TIMEOUT_MARKER) });
	const response = await updatePassword(request({ password: "StrongPassword1!" }));
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({ error: "password_update_unknown" });
	expect(response.headers.get("set-cookie")).toBeNull();
});

it("a definite anonymous session cannot update the password", async () => {
	createClient.mockResolvedValue({ auth: { getUser, updateUser } });
	getUser.mockResolvedValue({ data: { user: null }, error: null });
	const response = await updatePassword(request({ password: "StrongPassword1!" }));
	expect(response.status).toBe(403);
	expect(updateUser).not.toHaveBeenCalled();
});

it("an Auth callback timeout redirects to an unavailable state instead of a verification failure", async () => {
	createClient.mockResolvedValue({ auth: { exchangeCodeForSession } });
	exchangeCodeForSession.mockResolvedValue({ error: new Error(AUTH_TIMEOUT_MARKER) });
	const response = await callback(
		new NextRequest("https://checkin.tgmeducation.net/auth/callback?code=test-code&next=/reset-password"),
	);
	expect(response.status).toBe(307);
	expect(response.headers.get("location")).toBe("https://checkin.tgmeducation.net/login?error=auth-unavailable");
});
