import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintableQr } from "./PrintableQr";

const branch = { id: "fb000000-0000-4000-8000-000000000011", name: "Lagos", public_slug: "slug", is_active: true };

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("printable check-in QR", () => {
	it("blocks distribution while the privacy notice is unapproved", () => {
		render(
			<PrintableQr
				branch={branch}
				organizationName="TGM"
				privacyApproved={false}
				url="https://example.test/check-in/slug"
			/>,
		);
		expect(screen.getByRole("button", { name: "Print QR" }).hasAttribute("disabled")).toBe(true);
		expect(screen.queryByRole("img", { name: /QR code for check-in/ })).toBeNull();
	});
	it("exposes the QR and alternative URL when public check-in is available", () => {
		render(
			<PrintableQr
				branch={branch}
				organizationName="TGM"
				privacyApproved
				url="https://example.test/check-in/slug"
			/>,
		);
		expect(screen.getByRole("img", { name: "QR code for check-in at Lagos" })).toBeTruthy();
		expect(screen.getByText("https://example.test/check-in/slug")).toBeTruthy();
	});
	it("prints, downloads a self-contained SVG and copies the exact check-in URL", async () => {
		const print = vi.spyOn(window, "print").mockImplementation(() => {});
		const createObjectURL = vi.fn(() => "blob:test-qr");
		Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
		Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		const url = "https://checkin.tgmeducation.net/check-in/slug";
		render(<PrintableQr branch={branch} organizationName="TGM" privacyApproved url={url} />);
		const user = userEvent.setup();
		const writeText = vi.spyOn(navigator.clipboard, "writeText");
		await user.click(screen.getByRole("button", { name: "Print QR" }));
		await user.click(screen.getByRole("button", { name: "Download SVG" }));
		await user.click(screen.getByRole("button", { name: "Copy link" }));
		expect(await screen.findByText("Check-in link copied.")).toHaveAttribute("role", "status");
		expect(print).toHaveBeenCalledOnce();
		expect(click).toHaveBeenCalledOnce();
		expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(`tgm-check-in-${branch.id}.svg`);
		expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
		expect(writeText).toHaveBeenCalledWith(url);
	});
});
