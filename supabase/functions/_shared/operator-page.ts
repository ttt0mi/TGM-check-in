export type OperatorPageRow = {
	user_id: string;
	email: string;
	role: "admin" | "receptionist";
	is_active: boolean;
	location_id: string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseOperatorRows(value: unknown): OperatorPageRow[] {
	if (!Array.isArray(value)) throw new Error("Invalid operator directory response");
	return value.map((item): OperatorPageRow => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			throw new Error("Invalid operator directory response");
		const row = item as Record<string, unknown>;
		if (typeof row.user_id !== "string" || !uuid.test(row.user_id)
			|| typeof row.email !== "string" || !row.email.trim()
			|| (row.role !== "admin" && row.role !== "receptionist")
			|| typeof row.is_active !== "boolean"
			|| (row.location_id !== null && (typeof row.location_id !== "string" || !uuid.test(row.location_id))))
			throw new Error("Invalid operator directory response");
		return {
			user_id: row.user_id,
			email: row.email,
			role: row.role,
			is_active: row.is_active,
			location_id: row.location_id,
		};
	});
}
