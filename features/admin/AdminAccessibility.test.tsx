import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, expect, it, vi } from "vitest";
import { BranchManagement } from "./BranchManagement";
import { PrintableQr } from "./PrintableQr";

vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));

afterEach(cleanup);

it("has no serious or critical automated accessibility violations on core admin controls", async () => {
	const { container } = render(
		<>
			<BranchManagement branches={[]} onChanged={vi.fn()} />
			<PrintableQr
				branch={{
					id: "fb000000-0000-4000-8000-000000000011",
					name: "Lagos",
					public_slug: "lagos",
					is_active: true,
				}}
				organizationName="TGM"
				privacyApproved
				url="https://checkin.tgmeducation.net/check-in/lagos"
			/>
		</>,
	);
	const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
	expect(result.violations.filter((issue) => ["critical", "serious"].includes(issue.impact ?? ""))).toEqual([]);
});
