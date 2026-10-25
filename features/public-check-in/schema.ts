import { z } from "zod";

export const visitTypes = ["school", "business", "counselling", "travels", "vendors", "other"] as const;

export const publicVisitSchema = z
	.object({
		visitor_full_name: z.string().trim().min(1, "Enter your full name").max(120),
		visitor_preferred_name: z.string().trim().max(80),
		visitor_email: z.union([z.string().email(), z.literal("")]),
		phone_number: z
			.string()
			.trim()
			.regex(/^\+[1-9]\d{1,14}$/, "Use international format, for example +234...")
			.max(16),
		organization: z.string().trim().max(120),
		visit_type: z.enum(visitTypes),
		purpose: z.string().trim().min(1, "Tell us why you are visiting").max(500),
		department_id: z.string(),
		staff_id: z.string(),
	})
	.refine((data) => !data.staff_id || Boolean(data.department_id), {
		path: ["department_id"],
		message: "Choose a department for your host",
	});

export type PublicVisitValues = z.infer<typeof publicVisitSchema>;
