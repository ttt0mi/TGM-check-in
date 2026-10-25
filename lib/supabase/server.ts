import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/supabase/functions/_shared/database.types";
import { supabaseConfig } from "./config";

export async function createClient() {
	const cookieStore = await cookies();
	const { url, key } = supabaseConfig();
	return createServerClient<Database>(url, key, {
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
