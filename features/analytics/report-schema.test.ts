import { describe, expect, it } from "vitest";
import { reportSchema } from "./report-schema";

const valid = {
	total: 1,
	statuses: { checked_out: 1 },
	visit_types: { business: 1 },
	check_in_methods: { assisted: 1 },
	branches: { "fb000000-0000-4000-8000-000000000011": 1 },
	series: [{ date: "2026-10-23", count: 1 }],
	hours: { "09": 1 },
	average_duration_minutes: 30,
	branch_ranges: { "fb000000-0000-4000-8000-000000000011": { start: "2026-10-23", end: "2026-10-23" } },
	start_date: "2026-10-23",
	end_date: "2026-10-23",
	preset: "custom",
	timezone_policy: "each_branch_local_day",
	generated_at: "2026-10-25T15:00:00+00:00",
};

describe("report response", () => {
	it("accepts the database report contract", () => {
		expect(reportSchema.safeParse(valid).success).toBe(true);
	});
	it("rejects incompatible or negative metrics before rendering", () => {
		expect(reportSchema.safeParse({ ...valid, total: -1 }).success).toBe(false);
		expect(reportSchema.safeParse({ ...valid, series: "broken" }).success).toBe(false);
	});
});
