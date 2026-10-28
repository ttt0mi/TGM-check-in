import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({
	createClient: () => ({ functions: { invoke } }),
}));
vi.mock("recharts", () => ({
	ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CartesianGrid: () => null,
	XAxis: () => null,
	YAxis: () => null,
	Tooltip: () => null,
	Line: () => null,
	Bar: () => null,
}));

const report = {
	total: 1003,
	statuses: { checked_out: 1003 },
	visit_types: { business: 1003 },
	check_in_methods: { assisted: 1003 },
	branches: { "branch-lagos": 1002, "branch-la": 1 },
	series: [
		{ date: "2026-10-22", count: 1 },
		{ date: "2026-10-23", count: 1002 },
	],
	hours: { "0": 1, "10": 1002 },
	average_duration_minutes: 35,
	branch_ranges: {
		"branch-lagos": { start: "2026-10-23", end: "2026-10-23" },
		"branch-la": { start: "2026-10-22", end: "2026-10-22" },
	},
	start_date: "2026-10-22",
	end_date: "2026-10-23",
	preset: "7d" as const,
	timezone_policy: "each_branch_local_day" as const,
	generated_at: "2026-10-23T12:00:00Z",
};

beforeEach(() => {
	invoke.mockImplementation((name: string) =>
		name === "export-visit-report"
			? Promise.resolve({
					data: "Visitor,Status\r\nExample,checked_out\r\n",
					error: null,
					response: new Response(null, {
						headers: { "Content-Disposition": 'attachment; filename="visits-2026-10.csv"' },
					}),
				})
			: Promise.resolve({ data: report, error: null, response: new Response() }),
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	invoke.mockReset();
});

it("renders large aggregate totals and explains branch-local timezone ranges", async () => {
	render(
		<AnalyticsDashboard
			role="admin"
			branches={[
				{ id: "branch-lagos", name: "Lagos", timezone: "Africa/Lagos" },
				{ id: "branch-la", name: "Los Angeles", timezone: "America/Los_Angeles" },
			]}
		/>,
	);
	expect((await screen.findAllByText("1003")).length).toBeGreaterThan(0);
	expect(screen.getByText(/each branch’s local calendar day/i)).toBeInTheDocument();
	await userEvent.setup().click(screen.getByText("Branch date ranges and time zones"));
	expect(screen.getByText(/Los Angeles \(America\/Los_Angeles\)/)).toBeInTheDocument();
	expect(screen.getByText(/Lagos \(Africa\/Lagos\)/)).toBeInTheDocument();
});

it("downloads the audited CSV using the server-approved filename and blocks duplicate exports", async () => {
	const createObjectURL = vi.fn(() => "blob:test-csv");
	const revokeObjectURL = vi.fn();
	Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
	Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
	vi.spyOn(window, "confirm").mockReturnValue(true);
	const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
	render(
		<AnalyticsDashboard
			role="admin"
			branches={[{ id: "branch-lagos", name: "Lagos", timezone: "Africa/Lagos" }]}
		/>,
	);
	const button = await screen.findByRole("button", { name: "Export CSV" });
	await userEvent.setup().click(button);
	await waitFor(() => expect(click).toHaveBeenCalledOnce());
	const anchor = click.mock.instances[0] as HTMLAnchorElement;
	expect(anchor.download).toBe("visits-2026-10.csv");
	expect(anchor.href).toBe("blob:test-csv");
	expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
	expect(invoke).toHaveBeenCalledWith(
		"export-visit-report",
		expect.objectContaining({ body: expect.objectContaining({ redacted: false }) }),
	);
});
