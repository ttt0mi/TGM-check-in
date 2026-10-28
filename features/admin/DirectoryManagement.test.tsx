import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { timeoutError } from "@/lib/http/request-error";
import { DirectoryManagement } from "./DirectoryManagement";

let operation = "read";
const builder: Record<string, (...args: unknown[]) => unknown> = {};
for (const method of ["select", "eq", "order", "range", "ilike", "in", "limit", "update"]) {
	builder[method] = () => builder;
}
builder.insert = () => {
	operation = "insert";
	return builder;
};
builder.abortSignal = async () => {
	if (operation === "insert") throw timeoutError();
	return { data: [], count: 0, error: null };
};

vi.mock("@/lib/supabase/browser", () => ({
	createClient: () => ({ from: () => builder }),
}));

afterEach(() => {
	cleanup();
	operation = "read";
});

it("retains a department mutation and restores controls after timeout", async () => {
	render(
		<DirectoryManagement
			organizationId="ac000000-0000-4000-8000-000000000001"
			branches={[]}
			departments={[]}
			staff={[]}
			onChanged={vi.fn()}
		/>,
	);
	await screen.findByText("0 staff assignment(s) found");
	const user = userEvent.setup();
	await user.type(screen.getByLabelText("Department name"), "Operations");
	await user.click(screen.getByRole("button", { name: "Add department" }));
	expect(await screen.findByText("This request took too long. Check its status before retrying.")).toHaveAttribute(
		"role",
		"alert",
	);
	expect(screen.getByLabelText("Department name")).toHaveValue("Operations");
	expect(screen.getByRole("button", { name: "Add department" })).toBeEnabled();
});
