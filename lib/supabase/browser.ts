import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/supabase/functions/_shared/database.types";
import { supabaseConfig } from "./config";
import { createBoundedSupabaseFetch, INTERACTIVE_AUTH_TIMEOUT_MS } from "./transport";

// singleton
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
	if (!browserClient) {
		const { url, key } = supabaseConfig();
		browserClient = createBrowserClient<Database>(url, key, {
			global: { fetch: createBoundedSupabaseFetch(INTERACTIVE_AUTH_TIMEOUT_MS) },
		});
	}
	return browserClient;
}
