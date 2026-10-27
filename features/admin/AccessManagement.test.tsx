import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
	operators: (typeof firstOperator)[] | (typeof secondOperator)[],
	operatorNextCursor: { email: string; id: string } | null,
) {
	return {
		data: {
			operators,
			operator_next_cursor: operatorNextCursor,
			invitations: [],
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
		expect(invoke).toHaveBeenCalledWith("operator-directory", {
			body: {
				operator_search: "",
				operator_after_email: firstOperator.email,
				operator_after_id: firstOperator.user_id,
			},
		});
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
			expect(invoke).toHaveBeenCalledWith("operator-directory", {
				body: { search: "", operator_search: "special" },
			}),
		);
		await user.click(screen.getByRole("button", { name: "Load more operators" }));

		await screen.findByText("Unable to load more operators. Please retry.");
		expect(screen.getByText(firstOperator.email)).toBeTruthy();
		expect(screen.getByText("1 operator(s) loaded; more available")).toBeTruthy();
	});
});
