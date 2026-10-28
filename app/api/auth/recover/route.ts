import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost } from "@/lib/http/same-origin";
import { createClient } from "@/lib/supabase/server";
import { createRecoveryIntent, recoveryCookie, recoveryCookieOptions } from "@/lib/auth/recovery-intent";
import { frontendEnabled } from "@/lib/feature-flags";
import { authTransportError } from "@/lib/supabase/auth-error";

export async function POST(request: NextRequest) {
	if (!frontendEnabled("auth")) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
	if (!isSameOriginPost(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	let tokenHash: unknown;
	try {
		const body = (await request.json()) as { token_hash?: unknown };
		tokenHash = body.token_hash;
	} catch {
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
	if (typeof tokenHash !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(tokenHash))
		return NextResponse.json({ error: "Invalid recovery link" }, { status: 400 });
	const supabase = await createClient();
	const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
	const transport = authTransportError(error);
	if (transport)
		return NextResponse.json(
			{ error: transport.kind === "timeout" ? "auth_timeout" : "auth_unavailable" },
			{ status: 503 },
		);
	if (error && (error.status ?? 0) >= 500) return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
	if (error || !data.user)
		return NextResponse.json({ error: "This recovery link is invalid or expired" }, { status: 410 });
	const response = NextResponse.json({ accepted: true });
	response.cookies.set(recoveryCookie, createRecoveryIntent(data.user.id), recoveryCookieOptions);
	return response;
}
