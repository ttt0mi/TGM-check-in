import { afterEach, expect, it, vi } from "vitest";
import { invokePublicFunction } from "./public-function";
import { RequestError } from "./request-error";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it("distinguishes a request timeout from user cancellation", async () => {
	vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
	vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key-123");
	vi.stubGlobal(
		"fetch",
		vi.fn(
			(_url, init: RequestInit) =>
				new Promise((_resolve, reject) => {
					init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
				}),
		),
	);
	vi.useFakeTimers();
	const timedOut = invokePublicFunction("directory", { method: "GET" }, 100);
	const timeoutResult = expect(timedOut).rejects.toMatchObject({
		kind: "timeout",
		message: expect.stringContaining("took too long"),
	});
	await vi.advanceTimersByTimeAsync(100);
	await timeoutResult;
	const controller = new AbortController();
	controller.abort();
	await expect(
		invokePublicFunction("directory", { method: "GET", signal: controller.signal }, 100),
	).rejects.toMatchObject({ kind: "cancelled" } satisfies Partial<RequestError>);
});
