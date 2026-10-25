import { beforeEach, describe, expect, it } from "vitest";
import { createVisitorToken, loadVisitorToken, saveVisitorToken, terminalStatuses } from "./session";

describe("visitor session credentials", () => {
	beforeEach(() => sessionStorage.clear());

	it("creates independent 32-byte base64url tokens", () => {
		const first = createVisitorToken();
		const second = createVisitorToken();
		expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(second).not.toBe(first);
	});

	it("keeps a token in its branch's tab storage only", () => {
		const token = createVisitorToken();
		saveVisitorToken("branch-a", token);
		expect(loadVisitorToken("branch-a")).toBe(token);
		expect(loadVisitorToken("branch-b")).toBeNull();
	});

	it("treats every completed visit state as terminal", () => {
		expect([...terminalStatuses].sort()).toEqual(["auto_closed", "cancelled", "checked_out", "declined"]);
		expect(terminalStatuses.has("approved_on_site")).toBe(false);
	});
});
