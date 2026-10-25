import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost } from "@/lib/http/same-origin";

export async function POST(request: NextRequest) {
	if (!isSameOriginPost(request)) {
		return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	}
	const body = (await request.json().catch(() => null)) as {
		token?: unknown;
	} | null;
	const token = body?.token;
	if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
		return NextResponse.json({ error: "Invalid invitation link" }, { status: 400 });
	}
	const response = NextResponse.json({ saved: true });
	response.cookies.set("tgm_invitation", token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/",
		maxAge: 7 * 24 * 60 * 60,
	});
	return response;
}
