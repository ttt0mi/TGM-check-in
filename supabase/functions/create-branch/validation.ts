import { requiredText } from "../_shared/tgm.ts";
import type { JsonObject } from "../_shared/tgm.ts";

export function parseBranchDetails(body: JsonObject) {
	return {
		name: requiredText(body.name, "branch name", 120),
		address: requiredText(body.address, "address", 240),
		timezone: requiredText(body.timezone, "timezone", 80),
	};
}
