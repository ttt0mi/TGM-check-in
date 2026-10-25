import { z } from "zod";

export type AuthMode = "login" | "signup" | "recovery" | "reset";
export type AuthValues = { email: string; password: string; confirmPassword: string };

export const passwordRules = [
	{ label: "At least 8 characters", test: (value: string) => value.length >= 8 },
	{ label: "A lowercase letter", test: (value: string) => /[a-z]/.test(value) },
	{ label: "An uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
	{ label: "A number", test: (value: string) => /[0-9]/.test(value) },
	{ label: "A symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export function authFormSchema(mode: AuthMode) {
	return z
		.object({ email: z.string(), password: z.string(), confirmPassword: z.string() })
		.superRefine((values, context) => {
			if (mode !== "reset" && !z.string().email().safeParse(values.email.trim()).success)
				context.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
			if (mode === "login" && !values.password)
				context.addIssue({ code: "custom", path: ["password"], message: "Enter your password." });
			if (mode === "signup" || mode === "reset") {
				if (!passwordRules.every((rule) => rule.test(values.password)))
					context.addIssue({
						code: "custom",
						path: ["password"],
						message: "Meet every password requirement.",
					});
				if (values.password !== values.confirmPassword)
					context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
			}
		});
}
