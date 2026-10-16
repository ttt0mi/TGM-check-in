import type { Database as GeneratedDatabase, Json } from "./database.types.ts";

export type { Json };

type Functions = GeneratedDatabase["public"]["Functions"];

type WithArgs<
	FunctionName extends keyof Functions,
	Args extends object,
> = Omit<Functions[FunctionName], "Args"> & {
	Args: Omit<Functions[FunctionName]["Args"], keyof Args> & Args;
};

// PostgreSQL function parameters are nullable unless the function body rejects
// NULL. The generator cannot infer that nullability, so retain these runtime
// contracts separately from the generated schema.
export type Database = Omit<GeneratedDatabase, "public"> & {
	public: Omit<GeneratedDatabase["public"], "Functions"> & {
		Functions: Omit<
			Functions,
			"tgm_create_assisted_visit" | "tgm_create_public_visit"
		> & {
			tgm_create_assisted_visit: WithArgs<
				"tgm_create_assisted_visit",
				{
					p_department_id: string | null;
					p_organization: string | null;
					p_staff_id: string | null;
					p_visitor_email: string | null;
					p_visitor_preferred_name: string | null;
				}
			>;
			tgm_create_public_visit: WithArgs<
				"tgm_create_public_visit",
				{
					p_department_id: string | null;
					p_organization: string | null;
					p_staff_id: string | null;
					p_visitor_email: string | null;
					p_visitor_preferred_name: string | null;
				}
			>;
		};
	};
};
