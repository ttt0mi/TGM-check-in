import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistedForm } from "./AssistedForm";
import type { Department, Staff } from "./types";
import { timeoutError } from "@/lib/http/request-error";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/http/invoke-function", () => ({ invokeFunction: invoke }));
vi.mock("@/lib/hooks/use-online-status", () => ({ useOnlineStatus: () => true }));

const department: Department = { id: "de000000-0000-4000-8000-000000000001", name: "Office", is_active: true };
const host: Staff = {
	id: "de000000-0000-4000-8000-000000000002",
	department_id: department.id,
	location_id: "de000000-0000-4000-8000-000000000003",
	full_name: "Host Name",
	preferred_name: null,
	email: "host@example.test",
	is_active: true,
};
const props = {
	branchId: host.location_id,
	branchName: "Lagos",
	departments: [department],
	staff: [host],
	onCreated: vi.fn(),
	onCancel: vi.fn(),
};

afterEach(() => {
	cleanup();
	invoke.mockReset();
	vi.restoreAllMocks();
});

async function fillRequired() {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText("Full name"), "Visitor Name");
	await user.type(screen.getByLabelText("Phone number"), "08012345678");
	await user.type(screen.getByLabelText("Purpose"), "Meeting");
	return user;
}

describe("assisted check-in validation", () => {
	it("shows adjacent stable errors and focuses the first invalid field", async () => {
		render(<AssistedForm {...props} />);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Create visit" }));
		const name = screen.getByLabelText("Full name");
		const phone = screen.getByLabelText("Phone number");
		const purpose = screen.getByLabelText("Purpose");
		await waitFor(() => expect(name).toHaveFocus());
		for (const [control, id] of [
			[name, "visitor_full_name"],
			[phone, "phone_number"],
			[purpose, "purpose"],
		] as const) {
			expect(control).toHaveAttribute("aria-invalid", "true");
			expect(control).toHaveAttribute("aria-describedby", `assisted-${id}-error`);
			expect(document.getElementById(`assisted-${id}-error`)).toHaveAttribute("role", "alert");
		}
		await user.type(name, "Visitor Name");
		await waitFor(() => expect(name).not.toHaveAttribute("aria-invalid"));
		expect(phone).toHaveAttribute("aria-invalid", "true");
	});

	it("links optional-field, visit-type and host relationship failures to their controls", async () => {
		render(<AssistedForm {...props} />);
		const user = await fillRequired();
		fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "x".repeat(81) } });
		fireEvent.change(screen.getByLabelText("Email (optional)"), { target: { value: "bad-email" } });
		fireEvent.change(screen.getByLabelText("Organization (optional)"), { target: { value: "x".repeat(121) } });
		fireEvent.change(screen.getByLabelText("Visit type"), { target: { value: "invalid" } });
		await user.click(screen.getByRole("button", { name: "Create visit" }));
		for (const field of ["visitor_preferred_name", "visitor_email", "organization", "visit_type"]) {
			const control = document.getElementById(`assisted-${field}`);
			expect(control).toHaveAttribute("aria-describedby", `assisted-${field}-error`);
			expect(document.getElementById(`assisted-${field}-error`)).toBeTruthy();
		}
	});

	it("keeps values after server failure and keeps host help attached", async () => {
		invoke.mockRejectedValueOnce(new Error("server failure"));
		vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<AssistedForm {...props} />);
		const user = await fillRequired();
		await user.selectOptions(screen.getByLabelText("Department (optional)"), department.id);
		await user.selectOptions(screen.getByLabelText("Host (optional)"), host.id);
		await user.click(screen.getByRole("button", { name: "Create visit" }));
		await screen.findByText("The visit outcome is unclear. Check the queue before retrying.");
		expect(screen.getByLabelText("Full name")).toHaveValue("Visitor Name");
		expect(screen.getByLabelText("Host (optional)")).toHaveAttribute("aria-describedby", "assisted-host-help");
		expect(props.onCreated).not.toHaveBeenCalled();
	});

	it("identifies a host without a department", async () => {
		render(<AssistedForm {...props} />);
		const user = await fillRequired();
		const hostControl = screen.getByLabelText("Host (optional)") as HTMLSelectElement;
		const staleOption = document.createElement("option");
		staleOption.value = host.id;
		staleOption.textContent = "Stale host";
		hostControl.append(staleOption);
		fireEvent.change(hostControl, { target: { value: host.id } });
		await user.click(screen.getByRole("button", { name: "Create visit" }));
		const control = screen.getByLabelText("Department (optional)");
		await waitFor(() => expect(control).toHaveAttribute("aria-invalid", "true"));
		expect(control.getAttribute("aria-describedby")).toBe("assisted-department_id-error");
		expect(screen.getByText("Choose a department for your host")).toHaveAttribute("role", "alert");
		expect(invoke).not.toHaveBeenCalled();
	});

	it("retains the idempotency key and entered values after timeout", async () => {
		invoke.mockRejectedValueOnce(timeoutError()).mockRejectedValueOnce(timeoutError());
		vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<AssistedForm {...props} />);
		const user = await fillRequired();
		await user.click(screen.getByRole("button", { name: "Create visit" }));
		await screen.findByText("This request took too long. Check its status before retrying.");
		expect(screen.getByLabelText("Full name")).toHaveValue("Visitor Name");
		expect(screen.getByRole("button", { name: "Create visit" })).toBeEnabled();
		await user.click(screen.getByRole("button", { name: "Create visit" }));
		await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
		expect(invoke.mock.calls[0][1].idempotency_key).toBe(invoke.mock.calls[1][1].idempotency_key);
	});
});
