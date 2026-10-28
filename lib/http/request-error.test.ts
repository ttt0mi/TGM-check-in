import { afterEach, describe, expect, it, vi } from "vitest";
import { functionError, networkError, postgrestError, requestError } from "./request-error";

afterEach(() => vi.restoreAllMocks());

describe("safe request errors", () => {
	it.each([
		[401, "unauthorized"],
		[403, "forbidden"],
		[409, "conflict"],
		[429, "rate_limited"],
		[503, "unavailable"],
	] as const)("maps HTTP %i without rendering raw content", async (status, kind) => {
		const failure = await requestError(
			Response.json({ error: "private.email@example.test SQL stack", code: "unknown_code" }, { status }),
		);
		expect(failure.kind).toBe(kind);
		expect(failure.message).not.toContain("private.email");
		expect(failure.message).not.toContain("SQL");
	});
	it("maps explicit dependency and inactive codes", async () => {
		expect((await requestError(Response.json({ code: "active_visits" }, { status: 409 }))).message).toContain(
			"active visits",
		);
		expect((await requestError(Response.json({ code: "resource_inactive" }, { status: 400 }))).message).toContain(
			"inactive",
		);
	});
	it("ignores malformed identifiers and PostgREST internals", async () => {
		const failure = await requestError(
			Response.json({ code: "bad <script>", correlation_id: "secret" }, { status: 500 }),
		);
		expect(failure.code).toBeUndefined();
		expect(failure.correlationId).toBeUndefined();
		expect(postgrestError({ code: "23503" }).message).not.toContain("23503");
	});
	it("keeps a valid correlation reference and parses Edge errors", async () => {
		const id = "afe5b020-3300-4400-8800-123456789abc";
		const failure = await functionError(
			new Error("raw SQL"),
			Response.json({ correlation_id: id }, { status: 500 }),
		);
		expect(failure.correlationId).toBe(id);
		expect(failure.message).toContain(`Reference: ${id}`);
		expect(failure.message).not.toContain("SQL");
	});
	it.each([
		["42501", "forbidden"],
		["23505", "conflict"],
		["23514", "conflict"],
		["22023", "invalid"],
		["08006", "unavailable"],
		["PGRST301", "unauthorized"],
	] as const)("maps PostgREST %s to %s", (code, kind) => {
		expect(postgrestError({ code }).kind).toBe(kind);
	});
	it("names an offline browser failure without leaking transport details", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		expect(networkError().message).toContain("offline");
	});
});
