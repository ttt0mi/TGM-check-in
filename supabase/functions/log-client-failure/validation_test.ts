import { validateDiagnostic } from "./validation.ts";
import { HttpError } from "../_shared/tgm.ts";

Deno.test("client diagnostics accept only fixed categories and a correlation ID", () => {
	const valid = validateDiagnostic({ area: "page", kind: "render_failure", correlation_id: "11111111-1111-4111-8111-111111111111" });
	if (valid.area !== "page") throw new Error("Valid diagnostic was rejected");
	for (const payload of [
		{ area: "page", kind: "render_failure", correlation_id: valid.correlationId, email: "visitor@example.com" },
		{ area: "page", kind: "visitor@example.com", correlation_id: valid.correlationId },
		{ area: "page", kind: "render_failure", correlation_id: "not-a-uuid" },
	]) {
		try {
			validateDiagnostic(payload);
			throw new Error("Unsafe diagnostic was accepted");
		} catch (error) {
			if (!(error instanceof HttpError)) throw error;
		}
	}
});
