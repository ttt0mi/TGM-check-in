import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost } from "@/lib/http/same-origin";
import { createClient } from "@/lib/supabase/server";
import { functionError } from "@/lib/http/request-error";

export async function POST(request: NextRequest) {
	if (!isSameOriginPost(request)) {
		return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	}
	const token = request.cookies.get("tgm_invitation")?.value;
	if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
		return NextResponse.json({ error: "Invitation unavailable" }, { status: 400 });
	}
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user?.email_confirmed_at) {
		return NextResponse.json({ error: "Verify your email first" }, { status: 401 });
	}
	const { data, error, response: edgeResponse } = await supabase.functions.invoke("accept-operator-invite", { body: { token } });
	const failure = error ? await functionError(error, edgeResponse) : null;
	const response = NextResponse.json(
		failure ? { error: failure.message, code: failure.code } : data,
		{ status: failure ? failure.status ?? 503 : 200, headers: { "Cache-Control": "no-store" } },
	);
	if (!failure || ["invitation_invalid", "invitation_expired", "invitation_used", "invitation_unavailable"].includes(failure.code ?? ""))
		response.cookies.delete("tgm_invitation");
	return response;
}
