import { expect, it } from "vitest";
import { branchLocalToIso, formatBranchLocal } from "./branch-time";

it("converts branch-local Lagos time independently of browser timezone", () => {
	expect(branchLocalToIso("2026-10-26T10:30", "Africa/Lagos")).toBe("2026-10-26T09:30:00.000Z");
	expect(formatBranchLocal("2026-10-26T09:30:00.000Z", "Africa/Lagos")).toBe("2026-10-26T10:30");
});

it("rejects nonexistent and ambiguous daylight-saving times", () => {
	expect(branchLocalToIso("2026-03-08T02:30", "America/New_York")).toBeNull();
	expect(branchLocalToIso("2026-11-01T01:30", "America/New_York")).toBeNull();
});
