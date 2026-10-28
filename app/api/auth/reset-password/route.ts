import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost } from "@/lib/http/same-origin";
import { recoveryCookie, validRecoveryIntent } from "@/lib/auth/recovery-intent";
import { createClient } from "@/lib/supabase/server";
import { passwordRules } from "@/features/auth/schema";
import { frontendEnabled } from "@/lib/feature-flags";
import { authTransportError } from "@/lib/supabase/auth-error";
import { isAuthSessionMissingError } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
	if (!frontendEnabled("auth")) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
	if (!isSameOriginPost(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	let password: unknown;
	try {
		const body = (await request.json()) as { password?: unknown };
		password = body.password;
	} catch {
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
	if (typeof password !== "string" || !passwordRules.every((rule) => rule.test(password)))
		return NextResponse.json({ error: "weak_password" }, { status: 400 });
	const supabase = await createClient();
	const {
		data: { user },
		error: identityError,
	} = await supabase.auth.getUser();
	const identityFailure = authTransportError(identityError);
	if (identityFailure)
		return NextResponse.json(
			{ error: identityFailure.kind === "timeout" ? "auth_timeout" : "auth_unavailable" },
			{ status: 503 },
		);
	if (
		identityError &&
		identityError.status !== 401 &&
		identityError.status !== 403 &&
		identityError.code !== "session_not_found" &&
		!isAuthSessionMissingError(identityError)
	)
		return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
	if (!user || !validRecoveryIntent((await cookies()).get(recoveryCookie)?.value, user.id))
		return NextResponse.json({ error: "recovery_expired" }, { status: 403 });
	const { error } = await supabase.auth.updateUser({ password });
	if (authTransportError(error)) return NextResponse.json({ error: "password_update_unknown" }, { status: 503 });
	if (error && (error.status ?? 0) >= 500)
		return NextResponse.json({ error: "password_update_unknown" }, { status: 503 });
	if (error)
		return NextResponse.json(
			{ error: error.code === "weak_password" ? "weak_password" : "update_failed" },
			{ status: 400 },
		);
	const response = NextResponse.json({ complete: true });
	response.cookies.delete(recoveryCookie);
	return response;
}
