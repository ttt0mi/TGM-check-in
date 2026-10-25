import { supabaseConfig } from "@/lib/supabase/config";
import { networkError, requestError } from "@/lib/http/request-error";
import type { PublicDirectory, VisitorVisit } from "./types";

async function invoke<T>(name: string, init: RequestInit): Promise<T> {
	const { url, key } = supabaseConfig();
	const response = await fetch(`${url}/functions/v1/${name}`, {
		...init,
		headers: {
			apikey: key,
			"Content-Type": "application/json",
			...init.headers,
		},
		cache: "no-store",
	}).catch(() => {
		throw networkError();
	});
	if (!response.ok) throw await requestError(response);
	return (await response.json()) as T;
}

export function getPublicDirectory(slug: string, departmentId?: string) {
	const query = new URLSearchParams({ location: slug });
	if (departmentId) query.set("department", departmentId);
	return invoke<PublicDirectory>(`get-public-directory?${query}`, { method: "GET" });
}

export function submitPublicVisit(body: Record<string, unknown>) {
	return invoke<{ accepted: true }>("submit-public-visit", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function getVisitorVisit(token: string) {
	const result = await invoke<{ visit: VisitorVisit }>("get-visitor-visit", {
		method: "POST",
		body: JSON.stringify({ token }),
	});
	return result.visit;
}

export function respondToHostVisit(token: string, outcome: "approved" | "declined") {
	return invoke<{ outcome: string; requires_reception_admission: boolean }>("respond-to-host-visit", {
		method: "POST",
		body: JSON.stringify({ token, outcome }),
	});
}
