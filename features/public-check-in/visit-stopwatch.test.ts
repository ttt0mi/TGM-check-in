import { describe, expect, it } from "vitest";
import { formatElapsedTime, visitStopwatch } from "./visit-stopwatch";
import type { VisitorVisit } from "./types";

const now = new Date("2026-10-23T10:00:00.000Z");
const visit: VisitorVisit = {
	status: "approved_on_site",
	visitor_display_name: "Visitor",
	organization_name: "Organization",
	branch_name: "Branch",
	host_name: null,
	admitted_at: "2026-10-23T08:59:55.000Z",
	time_out: null,
	self_checkout_available: false,
};

describe("visitor stopwatch", () => {
	it("starts at admission and keeps counting across hours", () => {
		expect(visitStopwatch(visit, now).elapsedSeconds).toBe(3605);
		expect(formatElapsedTime(3605)).toBe("01:00:05");
		expect(formatElapsedTime(25 * 3600)).toBe("25:00:00");
	});

	it("freezes at the recorded checkout time", () => {
		const checkedOut = {
			...visit,
			status: "checked_out",
			time_out: "2026-10-23T09:01:00.000Z",
		};
		expect(visitStopwatch(checkedOut, now)).toEqual({
			elapsedSeconds: 65,
			message: "Stopped at checkout.",
		});
	});

	it("does not invent elapsed time before admission or without a final time", () => {
		expect(visitStopwatch(null, now).elapsedSeconds).toBe(0);
		expect(visitStopwatch({ ...visit, status: "declined", admitted_at: null }, now).elapsedSeconds).toBe(0);
		expect(visitStopwatch({ ...visit, status: "auto_closed" }, now).elapsedSeconds).toBeNull();
	});
});
