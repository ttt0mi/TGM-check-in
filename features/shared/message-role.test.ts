import { expect, it } from "vitest";
import { messageRole } from "./message-role";

it("announces failed refresh and dependency blockers as errors, success politely", () => {
	expect(messageRole("Invitation recorded, but records could not be refreshed.")).toBe("alert");
	expect(messageRole("Resolve 2 active visits before deactivating this host.")).toBe("alert");
	expect(messageRole("Invitation recorded.")).toBe("status");
});
