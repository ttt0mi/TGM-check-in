import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Branch } from "@/features/operator/types";
import { AccessManagement } from "./AccessManagement";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabase/browser", () => ({
	createClient: () => ({ functions: { invoke } }),
}));

const branch: Branch = {
	id: "af000000-0000-4000-8000-000000000001",
	name: "Lagos",
	timezone: "Africa/Lagos",
	public_slug: "lagos",
	is_active: true,
	auto_close_enabled: false,
	auto_close_local_time: null,
	address: "",
	reception_overdue_minutes: 15,
	host_overdue_minutes: 30,
	admission_overdue_minutes: 10,
};

const firstOperator = {
	user_id: "af000000-0000-4000-8000-000000000101",
	email: "first@test.example",
	role: "admin" as const,
	is_active: true,
	location_id: null,
};

const secondOperator = {
	user_id: "af000000-0000-4000-8000-000000000102",
	email: "second@test.example",
	role: "receptionist" as const,
	is_active: true,
	location_id: branch.id,
};

function directoryResponse(
	operators: Array<typeof firstOperator | typeof secondOperator>,
	operatorNextCursor: { email: string; id: string } | null,
	invitations: Record<string, unknown>[] = [],
) {
	return {
		data: {
			operators,
			operator_next_cursor: operatorNextCursor,
			invitations,
			next_cursor: null,
		},
		error: null,
	};
}

afterEach(() => {
	cleanup();
	invoke.mockReset();
});

describe("operator directory pagination", () => {
	it("loads more than 100 operators without duplicates or omissions", async () => {
		const operators = Array.from({ length: 101 }, (_, index) => ({
			...firstOperator,
			user_id: `af000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
			email: `operator-${String(index + 1).padStart(3, "0")}@test.example`,
		}));
		invoke.mockImplementation((_name: string, options: { body: Record<string, unknown> }) => {
			const after = options.body.operator_after_id;
			const start = after ? operators.findIndex((item) => item.user_id === after) + 1 : 0;
			const page = operators.slice(start, start + 25);
			const last = page.at(-1);
			return Promise.resolve(
				directoryResponse(
					page,
					start + page.length < operators.length && last ? { email: last.email, id: last.user_id } : null,
				),
			);
		});
		const user = userEvent.setup();
		render(<AccessManagement branches={[branch]} />);
		await screen.findByText("25 operator(s) loaded; more available");
		for (const expected of [50, 75, 100, 101]) {
			await user.click(screen.getByRole("button", { name: "Load more operators" }));
			await screen.findByText(`${expected} operator(s) loaded${expected < 101 ? "; more available" : ""}`);
		}
		expect(screen.queryByRole("button", { name: "Load more operators" })).not.toBeInTheDocument();
		for (const item of operators) expect(screen.getByText(item.email)).toBeInTheDocument();
		expect(invoke).toHaveBeenCalledTimes(5);
	}, 10_000);

	it("forwards the cursor and appends the next operator page", async () => {
		invoke.mockImplementation((_name: string, options: { body: Record<string, unknown> }) => {
			if (options.body.operator_after_id) return Promise.resolve(directoryResponse([secondOperator], null));
			return Promise.resolve(
				directoryResponse([firstOperator], { email: firstOperator.email, id: firstOperator.user_id }),
			);
		});
		const user = userEvent.setup();

		render(<AccessManagement branches={[branch]} />);

		await screen.findByText(firstOperator.email);
		expect(screen.getByText("1 operator(s) loaded; more available")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Load more operators" }));

		await screen.findByText(secondOperator.email);
		expect(screen.getByText("2 operator(s) loaded")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Load more operators" })).toBeNull();
		expect(invoke).toHaveBeenCalledWith(
			"operator-directory",
			expect.objectContaining({
				body: {
					operator_search: "",
					operator_after_email: firstOperator.email,
					operator_after_id: firstOperator.user_id,
				},
			}),
		);
	});

	it("forwards trimmed search text and keeps loaded rows when the next page fails", async () => {
		invoke.mockImplementation((_name: string, options: { body: Record<string, unknown> }) => {
			if (options.body.operator_after_id) return Promise.resolve({ data: null, error: new Error("offline") });
			return Promise.resolve(
				directoryResponse([firstOperator], { email: firstOperator.email, id: firstOperator.user_id }),
			);
		});
		const user = userEvent.setup();

		render(<AccessManagement branches={[branch]} />);
		await screen.findByText(firstOperator.email);
		await user.type(screen.getByRole("searchbox", { name: "Search operators" }), "  special  ");
		await user.click(screen.getByRole("button", { name: "Search operators" }));

		await waitFor(() =>
			expect(invoke).toHaveBeenCalledWith(
				"operator-directory",
				expect.objectContaining({
					body: { search: "", operator_search: "special" },
				}),
			),
		);
		await user.click(screen.getByRole("button", { name: "Load more operators" }));

		await screen.findByText("Connection unavailable. Check your connection and try again.");
		expect(screen.getByText(firstOperator.email)).toBeTruthy();
		expect(screen.getByText("1 operator(s) loaded; more available")).toBeTruthy();
	});

	it("shows delivery states and requires confirmation before resending an unknown delivery", async () => {
		const now = Date.now();
		const invitations = (["sent", "failed", "unknown"] as const).map((deliveryStatus, index) => ({
			id: `ad000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
			email: `${deliveryStatus}@test.example`,
			role: "admin",
			location_id: null,
			expires_at: new Date(now + 86_400_000).toISOString(),
			accepted_at: null,
			revoked_at: null,
			delivery_status: deliveryStatus,
			resend_count: 0,
			created_at: new Date(now).toISOString(),
			inviter_email: "owner@test.example",
			last_attempt_at: new Date(now).toISOString(),
		}));
		invoke.mockResolvedValue(directoryResponse([], null, invitations));
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		const user = userEvent.setup();
		render(<AccessManagement branches={[branch]} />);
		await screen.findByText(/Delivery: sent/);
		expect(screen.getByText(/Delivery: failed/)).toBeInTheDocument();
		expect(screen.getByText(/Delivery: unknown/)).toBeInTheDocument();
		const unknownRow = screen.getByText("unknown@test.example").closest("li");
		if (!unknownRow) throw new Error("Unknown invitation row missing");
		await user.click(within(unknownRow).getByRole("button", { name: "Resend" }));
		expect(confirm).toHaveBeenCalledWith(expect.stringContaining("previous email may have arrived"));
		expect(invoke).toHaveBeenCalledTimes(1);
		confirm.mockRestore();
	});
});
