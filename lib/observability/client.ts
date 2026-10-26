import { supabaseConfig } from "@/lib/supabase/config";

export function reportClientFailure(
	area: "page" | "public" | "host" | "operator",
	kind: "render_failure" | "network_failure" | "realtime_failure",
	correlationId = crypto.randomUUID(),
) {
	try {
		const { url, key } = supabaseConfig();
		void fetch(`${url}/functions/v1/log-client-failure`, {
			method: "POST",
			headers: { apikey: key, "Content-Type": "application/json" },
			body: JSON.stringify({ area, kind, correlation_id: correlationId }),
			cache: "no-store",
			keepalive: true,
		}).catch(() => {});
	} catch {
		// Reporting must never obscure the original failure.
	}
	return correlationId;
}
