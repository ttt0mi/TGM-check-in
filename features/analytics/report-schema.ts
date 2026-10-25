import { z } from "zod";

const counts = z.record(z.number().int().nonnegative());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reportSchema = z.object({
	total: z.number().int().nonnegative(),
	statuses: counts,
	visit_types: counts,
	check_in_methods: counts,
	branches: counts,
	series: z.array(z.object({ date: day, count: z.number().int().nonnegative() })).max(366),
	hours: counts,
	average_duration_minutes: z.number().int().nonnegative().nullable(),
	branch_ranges: z.record(z.object({ start: day, end: day })),
	start_date: day.nullable(),
	end_date: day.nullable(),
	preset: z.enum(["today", "7d", "30d", "mtd", "custom"]),
	timezone_policy: z.literal("each_branch_local_day"),
	generated_at: z.string().datetime({ offset: true }),
});

export type Report = z.infer<typeof reportSchema>;

const statusNames: Record<string, string> = {
	pending_reception_review: "Awaiting reception review",
	pending_host_acknowledgement: "Awaiting host response",
	host_approved_awaiting_reception: "Approved, awaiting admission",
	approved_on_site: "On site",
	checked_out: "Checked out",
	declined: "Declined",
	cancelled: "Cancelled",
	auto_closed: "Automatically closed",
};
const visitTypeNames: Record<string, string> = {
	school: "School",
	business: "Business",
	counselling: "Counselling",
	travels: "Travel",
	vendors: "Vendor",
	other: "Other",
};
const methodNames: Record<string, string> = { qr: "QR check-in", assisted: "Reception-assisted" };

export function reportLabel(kind: "status" | "type" | "method", value: string): string {
	return (kind === "status" ? statusNames : kind === "type" ? visitTypeNames : methodNames)[value] ?? "Unknown";
}
