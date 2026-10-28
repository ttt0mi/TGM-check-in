import { describe, expect, it } from "vitest";
import { authFormSchema } from "./schema";

describe("Auth password requirements", () => {
	it("accepts an existing sign-in password without applying new signup rules", () => {
		expect(
			authFormSchema("login").safeParse({
				email: "visitor@example.com",
				password: "old-password",
				confirmPassword: "",
			}).success,
		).toBe(true);
	});

	it("requires every configured rule and matching confirmation for new passwords", () => {
		const values = { email: "visitor@example.com", password: "Strong123!", confirmPassword: "Strong123!" };
		expect(authFormSchema("signup").safeParse(values).success).toBe(true);
		expect(authFormSchema("reset").safeParse({ ...values, password: "alllowercase1!" }).success).toBe(false);
		expect(authFormSchema("signup").safeParse({ ...values, confirmPassword: "different" }).success).toBe(false);
	});
});
