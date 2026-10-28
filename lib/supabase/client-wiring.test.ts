import { beforeEach, expect, it, vi } from "vitest";

const { createBrowserClient, createServerClient, getAll, set } = vi.hoisted(() => ({
	createBrowserClient: vi.fn(),
	createServerClient: vi.fn(),
	getAll: vi.fn(() => []),
	set: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createBrowserClient, createServerClient }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll, set }) }));
vi.mock("@/lib/supabase/config", () => ({
	supabaseConfig: () => ({ url: "https://example.test", key: "public-key" }),
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

it("keeps one browser client with the bounded Auth fetch", async () => {
	const sentinel = { auth: {} };
	createBrowserClient.mockReturnValue(sentinel);
	const { createClient } = await import("./browser");
	expect(createClient()).toBe(sentinel);
	expect(createClient()).toBe(sentinel);
	expect(createBrowserClient).toHaveBeenCalledTimes(1);
	expect(createBrowserClient.mock.calls[0][2].global.fetch).toEqual(expect.any(Function));
});

it("keeps the server cookie adapter while adding the bounded Auth fetch", async () => {
	createServerClient.mockReturnValue({ auth: {} });
	const { createClient } = await import("./server");
	await createClient();
	const options = createServerClient.mock.calls[0][2];
	expect(options.global.fetch).toEqual(expect.any(Function));
	expect(options.cookies.getAll()).toEqual([]);
	options.cookies.setAll([{ name: "sb-test", value: "value", options: { httpOnly: true } }]);
	expect(set).toHaveBeenCalledWith("sb-test", "value", { httpOnly: true });
});
