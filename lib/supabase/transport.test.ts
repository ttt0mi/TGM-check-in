import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_CANCELLED_MARKER, AUTH_TIMEOUT_MARKER, createBoundedSupabaseFetch } from "./transport";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("bounded Supabase Auth transport", () => {
	it("preserves request options and returns a successful Auth response", async () => {
		const clear = vi.spyOn(globalThis, "clearTimeout");
		const spy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.method).toBe("POST");
			expect(init?.headers).toEqual({ "Content-Type": "application/json" });
			expect(init?.body).toBe('{"email":"test@example.test"}');
			expect(init?.credentials).toBe("include");
			expect(init?.redirect).toBe("manual");
			return Response.json({ ok: true });
		});
		globalThis.fetch = spy as typeof fetch;
		const response = await createBoundedSupabaseFetch(100)("https://example.test/auth/v1/token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: '{"email":"test@example.test"}',
			credentials: "include",
			redirect: "manual",
		});
		expect(await response.json()).toEqual({ ok: true });
		expect(spy).toHaveBeenCalledTimes(1);
		expect(clear).toHaveBeenCalled();
	});

	it("aborts a hanging request once without retrying it", async () => {
		const spy = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
						once: true,
					});
				}),
		);
		globalThis.fetch = spy as typeof fetch;
		await expect(
			createBoundedSupabaseFetch(10)("https://example.test/auth/v1/signup", { method: "POST" }),
		).rejects.toThrow(AUTH_TIMEOUT_MARKER);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("respects both Request and init cancellation signals", async () => {
		const requestController = new AbortController();
		const initController = new AbortController();
		const spy = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
						once: true,
					});
				}),
		);
		globalThis.fetch = spy as typeof fetch;
		const request = new Request("https://example.test/auth/v1/token", {
			method: "POST",
			headers: { "X-Test": "kept" },
			body: "payload",
			signal: requestController.signal,
		});
		const remove = vi.spyOn(request.signal, "removeEventListener");
		const pending = expect(
			createBoundedSupabaseFetch(100)(request, { signal: initController.signal }),
		).rejects.toThrow(AUTH_CANCELLED_MARKER);
		requestController.abort();
		await pending;
		expect(spy).toHaveBeenCalledTimes(1);
		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	});

	it("rejects an already-aborted Request before calling fetch", async () => {
		const controller = new AbortController();
		controller.abort();
		const spy = vi.fn();
		globalThis.fetch = spy as typeof fetch;
		await expect(
			createBoundedSupabaseFetch(100)(
				new Request("https://example.test/auth/v1/user", { signal: controller.signal }),
			),
		).rejects.toThrow(AUTH_CANCELLED_MARKER);
		expect(spy).not.toHaveBeenCalled();
	});

	it("keeps non-Auth requests on their existing operation-specific limit", async () => {
		const spy = vi.fn(async () => Response.json({ ok: true }));
		globalThis.fetch = spy as typeof fetch;
		await createBoundedSupabaseFetch(1)("https://example.test/functions/v1/export-visit-report");
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
