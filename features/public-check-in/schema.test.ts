import { describe, expect, it } from "vitest";
import { publicVisitSchema } from "./schema";

const valid = {
	visitor_full_name: "Jane Doe",
	visitor_preferred_name: "",
	visitor_email: "",
	phone_number: "+2348012345678",
	organization: "",
	visit_type: "business",
	purpose: "Meeting",
	department_id: "",
	staff_id: "",
};

describe("public visit form", () => {
	it("accepts a visit without a host", () => {
		expect(publicVisitSchema.safeParse(valid).success).toBe(true);
	});

	it("requires a department when a host is selected", () => {
		expect(publicVisitSchema.safeParse({ ...valid, staff_id: "host-id" }).success).toBe(false);
	});

	it("rejects invalid contact details", () => {
		expect(publicVisitSchema.safeParse({ ...valid, phone_number: "08012345678" }).success).toBe(false);
		expect(publicVisitSchema.safeParse({ ...valid, visitor_email: "wrong" }).success).toBe(false);
	});
});
