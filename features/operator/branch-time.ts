function fields(value: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(value);
	const get = (name: string) => Number(parts.find((part) => part.type === name)?.value);
	return [get("year"), get("month"), get("day"), get("hour"), get("minute")] as const;
}

export function formatBranchLocal(iso: string, timezone: string) {
	const [year, month, day, hour, minute] = fields(new Date(iso), timezone);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function branchLocalToIso(local: string, timezone: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
	if (!match) return null;
	const desired = match.slice(1).map(Number) as [number, number, number, number, number];
	const [year, month, day, hour, minute] = desired;
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
	const target = Date.UTC(year, month - 1, day, hour, minute);
	let candidate = target;
	try {
		for (let index = 0; index < 4; index += 1) {
			const [y, m, d, h, min] = fields(new Date(candidate), timezone);
			const difference = target - Date.UTC(y, m - 1, d, h, min);
			candidate += difference;
			if (!difference) break;
		}
		if (fields(new Date(candidate), timezone).some((part, index) => part !== desired[index])) return null;
		for (const delta of [-120, -90, -60, -30, 30, 60, 90, 120]) {
			if (fields(new Date(candidate + delta * 60000), timezone).every((part, index) => part === desired[index]))
				return null;
		}
		return new Date(candidate).toISOString();
	} catch {
		return null;
	}
}
