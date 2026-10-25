import type { Database } from "@/supabase/functions/_shared/database.types";

export type Visit = Database["public"]["Tables"]["visits"]["Row"];
export type Branch = Pick<
	Database["public"]["Tables"]["locations"]["Row"],
	| "id"
	| "name"
	| "timezone"
	| "public_slug"
	| "is_active"
	| "auto_close_enabled"
	| "auto_close_local_time"
	| "address"
>;
export type Department = Pick<Database["public"]["Tables"]["departments"]["Row"], "id" | "name" | "is_active">;
export type Staff = Pick<
	Database["public"]["Tables"]["staff"]["Row"],
	"id" | "full_name" | "preferred_name" | "department_id" | "location_id" | "email" | "is_active"
>;
