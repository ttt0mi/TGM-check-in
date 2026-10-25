import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost } from "@/lib/http/same-origin";
import { createClient } from "@/lib/supabase/server";

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
	const { data, error } = await supabase.functions.invoke("accept-operator-invite", { body: { token } });
	const response = NextResponse.json(error ? { error: "Invitation could not be accepted" } : data, {
		status: error ? 409 : 200,
	});
	if (!error) response.cookies.delete("tgm_invitation");
	return response;
}
