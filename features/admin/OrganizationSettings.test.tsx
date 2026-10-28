import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { OrganizationSettings } from "./OrganizationSettings";
import { RequestError } from "@/lib/http/request-error";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/http/invoke-function", () => ({ invokeFunction: invoke }));

afterEach(() => {
	cleanup();
	invoke.mockReset();
});

it("approves privacy content through the authenticated Edge boundary without a body actor", async () => {
	invoke.mockResolvedValueOnce({ approved: true });
	const onChanged = vi.fn();
	render(
		<OrganizationSettings
			organization={{ id: "ee000000-0000-4000-8000-000000000001", name: "School" }}
			privacyNotice={null}
			onChanged={onChanged}
		/>,
	);
	const user = userEvent.setup();
	await user.type(
		screen.getByLabelText("Visitor notice"),
		"This is the organization's approved visitor check-in notice for testing.",
	);
	await user.type(screen.getByLabelText("Full privacy policy URL"), "https://example.test/privacy");
	await user.click(screen.getByRole("checkbox"));
	await user.click(screen.getByRole("button", { name: "Approve notice" }));
	await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
	const [name, body] = invoke.mock.calls[0];
	expect(name).toBe("approve-privacy-notice");
	expect(body).not.toHaveProperty("actor_id");
	expect(body.notice_copy).toContain("approved visitor");
	expect(screen.getByText("Privacy notice approved for public check-in.")).toHaveAttribute("role", "status");
});

it("shows a safe failure and restores approval controls", async () => {
	invoke.mockRejectedValueOnce(
		new RequestError("forbidden", 403, "You need active administrator access for this action."),
	);
	render(
		<OrganizationSettings
			organization={{ id: "ee000000-0000-4000-8000-000000000001", name: "School" }}
			privacyNotice={null}
			onChanged={vi.fn()}
		/>,
	);
	const user = userEvent.setup();
	await user.type(
		screen.getByLabelText("Visitor notice"),
		"This is the organization's approved visitor check-in notice for testing.",
	);
	await user.type(screen.getByLabelText("Full privacy policy URL"), "https://example.test/privacy");
	await user.click(screen.getByRole("checkbox"));
	await user.click(screen.getByRole("button", { name: "Approve notice" }));
	expect(await screen.findByText("You need active administrator access for this action.")).toHaveAttribute(
		"role",
		"alert",
	);
	expect(screen.getByRole("button", { name: "Approve notice" })).toBeEnabled();
	expect(screen.getByLabelText("Visitor notice")).toHaveValue(
		"This is the organization's approved visitor check-in notice for testing.",
	);
});
