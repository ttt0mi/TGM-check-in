import { createHmac, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Resend } from "resend";

const genericMessage =
	"If you have an active visit with this email, a checkout code will be sent. Check your inbox, or ask reception for help.";
const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY;
	const resendApiKey = process.env.RESEND_API_KEY;
	const resendFromEmail = process.env.RESEND_FROM_EMAIL;

	if (!supabaseUrl || !secretKey || !resendApiKey || !resendFromEmail) {
		return NextResponse.json(
			{ error: "Email-verified self-checkout is not configured. Please ask reception for help." },
			{ status: 503 },
		);
	}

	let input: { reception_token?: unknown; email?: unknown };
	try {
		input = (await request.json()) as { reception_token?: unknown; email?: unknown };
	} catch {
		return NextResponse.json({ error: "Enter the email address used for your visitor check-in." }, { status: 400 });
	}
	if (
		typeof input.reception_token !== "string" ||
		!uuidPattern.test(input.reception_token) ||
		typeof input.email !== "string" ||
		input.email.trim().length > 254 ||
		!emailPattern.test(input.email.trim())
	) {
		return NextResponse.json({ error: "Enter a valid check-in email address." }, { status: 400 });
	}

	const receptionToken = input.reception_token.toLowerCase();
	const email = input.email.trim().toLowerCase();
	const challengeId = randomUUID();
	const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
	const codeHash = createHmac("sha256", secretKey).update(`${challengeId}:${code}`).digest("hex");
	const serverClient = createClient(supabaseUrl, secretKey, {
		auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
	});
	const { data, error } = await serverClient.rpc("create_self_checkout_challenge", {
		reception_token: receptionToken,
		visitor_email: email,
		challenge_id: challengeId,
		verification_hash: codeHash,
	});
	if (error) {
		console.error("Unable to create a self-checkout challenge:", error.message);
		return NextResponse.json(
			{ error: "Unable to request a checkout code right now. Please ask reception for help." },
			{ status: 503 },
		);
	}
	const challenge = data?.[0] as
		{ created_challenge_id: string; visitor_name: string; send_code: boolean } | undefined;
	if (!challenge) {
		return NextResponse.json({ challenge_id: randomUUID(), message: genericMessage });
	}
	if (!challenge.send_code) {
		return NextResponse.json({ challenge_id: challenge.created_challenge_id, message: genericMessage });
	}

	const resend = new Resend(resendApiKey);
	const { error: emailError } = await resend.emails.send(
		{
			from: resendFromEmail,
			to: [email],
			subject: "Your TGM Check-in checkout code",
			text: [
				`Hello ${challenge.visitor_name},`,
				"",
				`Use this code to check out: ${code}`,
				"",
				"This code expires in 10 minutes and can only be used once. If you did not request it, you can ignore this email.",
			].join("\n"),
		},
		{ idempotencyKey: `tgm-self-checkout-${challengeId}` },
	);
	if (emailError) {
		const { error: cleanupError } = await serverClient
			.from("self_checkout_challenges")
			.delete()
			.eq("id", challengeId);
		if (cleanupError) console.error("Unable to remove an unsent self-checkout code:", cleanupError.message);
		console.error("Unable to send a self-checkout code:", emailError.message);
		return NextResponse.json(
			{ error: "Unable to send a checkout code right now. Please try again or ask reception for help." },
			{ status: 502 },
		);
	}

	return NextResponse.json({ challenge_id: challengeId, message: genericMessage });
}
