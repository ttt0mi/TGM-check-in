import { invokePublicFunction } from "@/lib/http/public-function";

export type HostPreview =
	| { state: "invalid" | "expired" | "used" }
	| {
			state: "active";
			visitor_name: string;
			visitor_organization: string | null;
			visit_type: string;
			purpose: string;
			branch_name: string;
			branch_timezone: string;
			arrived_at: string;
			expires_at: string;
	  };

export function getHostPreview(token: string) {
	return invokePublicFunction<HostPreview>("get-host-decision-preview", {
		method: "POST",
		body: JSON.stringify({ token }),
	});
}

export function respondToHostVisit(token: string, outcome: "approved" | "declined") {
	return invokePublicFunction<{ outcome: string; requires_reception_admission: boolean }>("respond-to-host-visit", {
		method: "POST",
		body: JSON.stringify({ token, outcome }),
	});
}
