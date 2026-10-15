import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codePattern = /^\d{6}$/;

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Email-verified self-checkout is not configured. Please ask reception for help." }, { status: 503 });
  }

  let input: { challenge_id?: unknown; code?: unknown };
  try {
    input = await request.json() as { challenge_id?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ error: "Enter the six-digit code from your email." }, { status: 400 });
  }
  if (
    typeof input.challenge_id !== "string"
    || !uuidPattern.test(input.challenge_id)
    || typeof input.code !== "string"
    || !codePattern.test(input.code)
  ) {
    return NextResponse.json({ error: "Enter the six-digit code from your email." }, { status: 400 });
  }

  const challengeId = input.challenge_id.toLowerCase();
  const submittedHash = createHmac("sha256", serviceRoleKey)
    .update(`${challengeId}:${input.code}`)
    .digest("hex");
  const serverClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await serverClient.rpc("verify_self_checkout_code", {
    challenge_id: challengeId,
    verification_hash: submittedHash,
  });
  if (error) {
    console.error("Unable to verify a self-checkout code:", error.message);
    return NextResponse.json({ error: "Unable to verify your checkout code right now. Please ask reception for help." }, { status: 503 });
  }
  if (data !== true) {
    return NextResponse.json({ error: "That code is invalid, expired, or already used. Request a new code or ask reception for help." }, { status: 400 });
  }

  return NextResponse.json({ checked_out: true });
}
