import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintableQr } from "./PrintableQr";

const branch = { id: "fb000000-0000-4000-8000-000000000011", name: "Lagos", public_slug: "slug", is_active: true };

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
});
