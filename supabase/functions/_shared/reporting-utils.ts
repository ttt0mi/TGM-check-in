export function localParts(value: string, timezone: string) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", hourCycle: "h23",
	}).formatToParts(new Date(value));
	const read = (name: string) => parts.find((part) => part.type === name)?.value ?? "";
	return { date: `${read("year")}-${read("month")}-${read("day")}`, hour: Number(read("hour")) };
}

export function csvCell(value: unknown) {
	let text = value == null ? "" : String(value);
	if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}
