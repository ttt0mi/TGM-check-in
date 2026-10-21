import { HttpError } from "../_shared/tgm.ts";
import { parseBranchDetails } from "./validation.ts";

const base = { name: "Main branch", timezone: "Africa/Lagos" };

Deno.test("branch address must be present, nonblank, and at most 240 characters", () => {
	for (const address of [undefined, null, "", "   ", 42, "a".repeat(241)]) {
		try {
			parseBranchDetails({ ...base, address });
			throw new Error(`Expected invalid address to be rejected: ${String(address)}`);
		} catch (error) {
			if (!(error instanceof HttpError) || error.status !== 400) throw error;
		}
	}
});

Deno.test("branch address accepts valid text and trims surrounding whitespace", () => {
	const result = parseBranchDetails({ ...base, address: "  123 Example Street  " });
	if (result.address !== "123 Example Street") throw new Error("Address was not normalized");
	if (parseBranchDetails({ ...base, address: "a".repeat(240) }).address.length !== 240)
		throw new Error("An address of 240 characters should be accepted");
});
