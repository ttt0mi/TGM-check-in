import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost } from "@/lib/http/same-origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
	if (!isSameOriginPost(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	const token = request.cookies.get("tgm_invitation")?.value;
	if (!token || !/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({ state: "invalid" });
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user?.email_confirmed_at) return NextResponse.json({ error: "Verify your email first" }, { status: 401 });
	const { data, error } = await supabase.functions.invoke("get-operator-invitation-preview", { body: { token } });
	if (error) return NextResponse.json({ error: "Invitation details are temporarily unavailable" }, { status: 503 });
	const response = NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
	if (["invalid", "expired", "revoked", "accepted"].includes(data?.state)) response.cookies.delete("tgm_invitation");
	return response;
}
