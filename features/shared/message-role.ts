export function messageRole(message: string): "alert" | "status" {
	if (/\b(could not|unclear|failed|timed out|expired|unavailable|conflict|retry)\b/i.test(message)) return "alert";
	return /\b(saved|approved|created|added|updated|renamed|revoked|requested|recorded)\b/i.test(message)
		? "status"
		: "alert";
}
