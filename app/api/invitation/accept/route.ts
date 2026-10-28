import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost } from "@/lib/http/same-origin";
import { createClient } from "@/lib/supabase/server";
import { functionError, RequestError } from "@/lib/http/request-error";
import { MUTATION_TIMEOUT_MS, withRequestTimeout } from "@/lib/http/timeout";
import { verifiedUser } from "@/lib/supabase/auth-error";

export async function POST(request: NextRequest) {
	if (!isSameOriginPost(request)) {
		return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	}
	const token = request.cookies.get("tgm_invitation")?.value;
	if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
		return NextResponse.json({ error: "Invitation unavailable" }, { status: 400 });
	}
	const supabase = await createClient();
	let user;
	try {
		user = await verifiedUser(supabase);
	} catch {
		return NextResponse.json(
			{ error: "Authentication temporarily unavailable", code: "auth_unavailable" },
			{ status: 503 },
		);
	}
	if (!user?.email_confirmed_at) {
		return NextResponse.json({ error: "Verify your email first" }, { status: 401 });
	}
	let data: unknown;
	let failure: RequestError | null = null;
	try {
		data = await withRequestTimeout(async (signal) => {
			const result = await supabase.functions.invoke("accept-operator-invite", { body: { token }, signal });
			if (result.error) throw await functionError(result.error, result.response);
			return result.data;
		}, MUTATION_TIMEOUT_MS);
	} catch (cause) {
		failure =
			cause instanceof RequestError
				? cause
				: new RequestError(
						"unavailable",
						503,
						"Invitation acceptance outcome is unclear. Refresh before retrying.",
					);
	}
	const response = NextResponse.json(failure ? { error: failure.message, code: failure.code } : data, {
		status: failure ? (failure.status ?? 503) : 200,
		headers: { "Cache-Control": "no-store" },
	});
	if (
		!failure ||
		["invitation_invalid", "invitation_expired", "invitation_used", "invitation_unavailable"].includes(
			failure.code ?? "",
		)
	)
		response.cookies.delete("tgm_invitation");
	return response;
}
