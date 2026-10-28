import { invokePublicFunction } from "@/lib/http/public-function";
import type { PublicDirectory, VisitorVisit } from "./types";

export function getPublicDirectory(slug: string, departmentId?: string) {
	const query = new URLSearchParams({ location: slug });
	if (departmentId) query.set("department", departmentId);
	return invokePublicFunction<PublicDirectory>(`get-public-directory?${query}`, { method: "GET" });
}

export function submitPublicVisit(body: Record<string, unknown>) {
	return invokePublicFunction<{ accepted: true }>("submit-public-visit", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function getVisitorVisit(token: string) {
	const result = await invokePublicFunction<{ visit: VisitorVisit }>("get-visitor-visit", {
		method: "POST",
		body: JSON.stringify({ token }),
	});
	return result.visit;
}
