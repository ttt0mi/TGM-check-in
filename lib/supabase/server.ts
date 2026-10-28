import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/supabase/functions/_shared/database.types";
import { supabaseConfig } from "./config";
import { createBoundedSupabaseFetch, SERVER_AUTH_TIMEOUT_MS } from "./transport";

export async function createClient() {
	const cookieStore = await cookies();
	const { url, key } = supabaseConfig();
	return createServerClient<Database>(url, key, {
		global: { fetch: createBoundedSupabaseFetch(SERVER_AUTH_TIMEOUT_MS) },
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(items) {
				try {
					items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
				} catch {
					// server components cannot write cookies; proxy.ts handles refresh writes.
				}
			},
		},
	});
}
