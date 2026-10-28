import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { timeoutError } from "@/lib/http/request-error";
import { BranchManagement } from "./BranchManagement";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/http/invoke-function", () => ({ invokeFunction: invoke }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));

afterEach(() => {
	cleanup();
	invoke.mockReset();
});

it("retains branch values and restores submission after an uncertain timeout", async () => {
	invoke.mockRejectedValueOnce(timeoutError());
	const onChanged = vi.fn();
	render(<BranchManagement branches={[]} onChanged={onChanged} />);
	const user = userEvent.setup();
	await user.type(screen.getByLabelText(/Name/), "Victoria Island");
	await user.type(screen.getByLabelText(/Address/), "1 Test Street");
	await user.clear(screen.getByLabelText(/Time zone/));
	await user.type(screen.getByLabelText(/Time zone/), "Africa/Lagos");
	await user.click(screen.getByRole("button", { name: "Create branch" }));
	expect(await screen.findByText("This request took too long. Check its status before retrying.")).toHaveAttribute(
		"role",
		"alert",
	);
	expect(screen.getByLabelText(/Name/)).toHaveValue("Victoria Island");
	expect(screen.getByLabelText(/Address/)).toHaveValue("1 Test Street");
	expect(screen.getByRole("button", { name: "Create branch" })).toBeEnabled();
	expect(onChanged).not.toHaveBeenCalled();
});
