import { afterEach, expect, it, vi } from "vitest";
import { invokeFunction } from "./invoke-function";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ functions: { invoke } }) }));

afterEach(() => {
	invoke.mockReset();
	vi.useRealTimers();
});

it("uses the safe Edge response instead of the SDK's raw error message", async () => {
	invoke.mockResolvedValueOnce({
		data: null,
		error: new Error("private@example.test SQL details"),
		response: Response.json({ code: "active_visits", error: "private@example.test" }, { status: 409 }),
	});
	await expect(invokeFunction("move-staff-assignment", {})).rejects.toMatchObject({
		kind: "conflict",
		message: "Resolve this person's active visits before making this change.",
	});
});

it("times out a pending invocation without starting a retry", async () => {
	vi.useFakeTimers();
	invoke.mockImplementation(
		(_name: string, options: { signal: AbortSignal }) =>
			new Promise((_resolve, reject) =>
				options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
			),
	);
	const pending = expect(invokeFunction("create-assisted-visit", {}, 50)).rejects.toMatchObject({ kind: "timeout" });
	await vi.advanceTimersByTimeAsync(50);
	await pending;
	expect(invoke).toHaveBeenCalledTimes(1);
});
