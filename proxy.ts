import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicConfigurationIssue } from "@/lib/configuration";
import { createBoundedSupabaseFetch, PROXY_AUTH_TIMEOUT_MS } from "@/lib/supabase/transport";

export async function proxy(request: NextRequest) {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (publicConfigurationIssue(url, key) || !url || !key) return NextResponse.next({ request });

	let response = NextResponse.next({ request });
	const supabase = createServerClient(url, key, {
		global: { fetch: createBoundedSupabaseFetch(PROXY_AUTH_TIMEOUT_MS) },
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(items) {
				items.forEach(({ name, value }) => request.cookies.set(name, value));
				response = NextResponse.next({ request });
				items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
			},
		},
	});
	// A failed refresh can be retried by Auth JS after the per-request deadline.
	// Await its result so a late refresh cannot write cookies after this response.
	// Protected pages perform their own bounded, fail-closed identity check.
	try {
		await supabase.auth.getClaims();
	} catch {
		return response;
	}
	return response;
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
