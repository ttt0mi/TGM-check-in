export function messageRole(message: string): "alert" | "status" {
	return /^(unable|enter|choose|move|resolve)\b|\b(could not|unclear|failed)\b/i.test(message) ? "alert" : "status";
}
