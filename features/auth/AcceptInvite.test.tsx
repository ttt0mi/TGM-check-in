import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AcceptInvite } from "./AcceptInvite";

const { replace, refresh, signOut } = vi.hoisted(() => ({
	replace: vi.fn(),
	refresh: vi.fn(),
	signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { signOut } }) }));

const originalFetch = globalThis.fetch;
afterEach(() => {
	cleanup();
	globalThis.fetch = originalFetch;
	vi.clearAllMocks();
});

function preview(email = "invited@test.example") {
	return {
		state: "active",
		invited_email: email,
		invited_role: "admin",
		organization_name: "Example School",
		branch_name: null,
		expires_at: "2026-11-01T12:00:00Z",
	};
}

it("prevents the wrong signed-in account from accepting an invitation", async () => {
	globalThis.fetch = vi.fn(async () => Response.json(preview())) as typeof fetch;
	render(<AcceptInvite accountEmail="different@test.example" />);
	expect((await screen.findAllByText(/invited@test.example/)).length).toBeGreaterThan(0);
	expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
	expect(screen.getByRole("alert")).toHaveTextContent("Sign in with invited@test.example");
});

it("accepts a matching invitation and enters the application", async () => {
	globalThis.fetch = vi
		.fn()
		.mockResolvedValueOnce(Response.json(preview()))
		.mockResolvedValueOnce(Response.json({ accepted: true }));
	render(<AcceptInvite accountEmail="invited@test.example" />);
	const button = await screen.findByRole("button", { name: "Accept invitation" });
	await userEvent.setup().click(button);
	expect(replace).toHaveBeenCalledWith("/start");
	expect(refresh).toHaveBeenCalledOnce();
});
