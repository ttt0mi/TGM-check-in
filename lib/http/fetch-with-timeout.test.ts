import { afterEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetch-with-timeout";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it("bounds response-body reading as well as the initial fetch", async () => {
	vi.useFakeTimers();
	vi.stubGlobal(
		"fetch",
		vi.fn((_input: RequestInfo | URL, init: RequestInit) =>
			Promise.resolve(
				new Response(
					new ReadableStream({
						start(controller) {
							init.signal?.addEventListener(
								"abort",
								() => controller.error(new DOMException("Aborted", "AbortError")),
								{ once: true },
							);
						},
					}),
					{ status: 200 },
				),
			),
		),
	);
	const pending = expect(fetchWithTimeout("/api/test", { method: "POST" }, 50)).rejects.toMatchObject({
		kind: "timeout",
	});
	await vi.advanceTimersByTimeAsync(50);
	await pending;
});
