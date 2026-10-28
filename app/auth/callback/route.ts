import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authTransportError } from "@/lib/supabase/auth-error";

export async function GET(request: NextRequest) {
	const code = request.nextUrl.searchParams.get("code");
	const next = request.nextUrl.searchParams.get("next");
	const destination = next === "/reset-password" ? next : "/start";
	if (code) {
		const supabase = await createClient();
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) return NextResponse.redirect(new URL(destination, request.url));
		if (authTransportError(error))
			return NextResponse.redirect(new URL("/login?error=auth-unavailable", request.url));
	}
	return NextResponse.redirect(new URL("/login?error=verification", request.url));
}
