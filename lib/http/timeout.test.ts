import { afterEach, expect, it, vi } from "vitest";
import { withRequestTimeout } from "./timeout";

afterEach(() => vi.useRealTimers());

it("distinguishes user cancellation from an elapsed timeout", async () => {
	vi.useFakeTimers();
	const waitForAbort = (signal: AbortSignal) =>
		new Promise<void>((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
		});
	const timedOut = expect(withRequestTimeout(waitForAbort, 50)).rejects.toMatchObject({ kind: "timeout" });
	await vi.advanceTimersByTimeAsync(50);
	await timedOut;
	const controller = new AbortController();
	const cancelled = expect(withRequestTimeout(waitForAbort, 100, controller.signal)).rejects.toMatchObject({
		kind: "cancelled",
	});
	controller.abort();
	await cancelled;
});
