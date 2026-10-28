import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/configuration", () => ({ publicConfigurationIssue: () => false }));

const originalFetch = globalThis.fetch;
const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
afterEach(() => {
	globalThis.fetch = originalFetch;
	if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
	else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
	if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
	vi.clearAllMocks();
});

it("allows navigation after one bounded claims request fails without redirecting", async () => {
	process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
	globalThis.fetch = vi.fn(
		(_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
					once: true,
				});
			}),
	) as typeof fetch;
	createServerClient.mockImplementation((_url, _key, options) => ({
		auth: {
			getClaims: () => options.global.fetch("https://example.test/auth/v1/user"),
		},
	}));
	const started = Date.now();
	const response = await proxy(new NextRequest("https://checkin.tgmeducation.net/app"));
	expect(Date.now() - started).toBeLessThan(6_000);
	expect(response.status).toBe(200);
	expect(response.headers.get("location")).toBeNull();
	expect(response.headers.get("set-cookie")).toBeNull();
}, 7_000);

it("keeps a returned claims error from becoming a false sign-out", async () => {
	process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
	createServerClient.mockReturnValue({
		auth: {
			getClaims: async () => ({ data: null, error: new Error("temporary network failure") }),
		},
	});
	const response = await proxy(new NextRequest("https://checkin.tgmeducation.net/app"));
	expect(response.status).toBe(200);
	expect(response.headers.get("location")).toBeNull();
	expect(response.headers.get("set-cookie")).toBeNull();
});

it("keeps successful cookie refresh propagation", async () => {
	process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
	createServerClient.mockImplementation((_url, _key, options) => ({
		auth: {
			getClaims: async () => {
				options.cookies.setAll([
					{ name: "sb-test-auth-token", value: "new-session", options: { httpOnly: true } },
				]);
				return { data: { claims: {} }, error: null };
			},
		},
	}));
	const response = await proxy(new NextRequest("https://checkin.tgmeducation.net/app"));
	expect(response.headers.get("set-cookie")).toContain("sb-test-auth-token=new-session");
});
