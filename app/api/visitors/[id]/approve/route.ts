import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type VisitorDetails = {
  id: string;
  owner_id: string;
  name: string;
  email: string;
  company: string;
  host_name: string;
  host_id: string | null;
  purpose: string;
  status: string;
  checked_in_at: string | null;
  host_notified_at: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!supabaseUrl || !supabaseAnonKey) return jsonError("Visitor approvals require Supabase configuration.", 503);
  if (!accessToken) return jsonError("Sign in as a workspace administrator to approve visitors.", 401);

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: userData, error: authError } = await client.auth.getUser(accessToken);
  if (authError || !userData.user) return jsonError("Your administrator session is invalid or expired. Please sign in again.", 401);

  const { id } = await context.params;
  const { data, error: visitorError } = await client
    .from("guests")
    .select("id, owner_id, name, email, company, host_name, host_id, purpose, status, checked_in_at, host_notified_at")
    .eq("id", id)
    .single();
  if (visitorError || !data) return jsonError("Visitor not found in this workspace.", 404);
  const visitor = data as unknown as VisitorDetails;
  if (!visitor.host_id) {
    return jsonError("This visitor's host is missing from the employee directory. Add or restore the host before approving.", 409);
  }
  if (visitor.status === "checked_out") {
    return jsonError("This visitor can no longer be approved.", 409);
  }

  if (visitor.status === "pending_approval") {
    const { error: approvalError } = await client
      .from("guests")
      .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending_approval");
    if (approvalError) return jsonError(`Unable to approve visitor: ${approvalError.message}`, 500);
  } else if (visitor.status !== "checked_in") {
    return jsonError("This visitor is not awaiting approval.", 409);
  }

  if (visitor.host_notified_at) {
    return NextResponse.json({ approved: true, emailSent: true, alreadyNotified: true });
  }

  if (!resendApiKey || !resendFromEmail) {
    return NextResponse.json({
      approved: true,
      emailSent: false,
      error: "Visitor approved, but email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL, then retry the host email.",
    });
  }
  if (!serviceRoleKey) {
    return jsonError("Host email lookup is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server before retrying.", 503);
  }

  const serverClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: host, error: hostError } = await serverClient
    .from("employee_hosts")
    .select("name, email")
    .eq("id", visitor.host_id)
    .eq("owner_id", visitor.owner_id)
    .single();
  if (hostError || !host) return jsonError("Unable to load the host's email address. Check the employee directory.", 409);

  const companyResult = await client
    .from("workspaces")
    .select("company_name")
    .eq("owner_id", visitor.owner_id)
    .single();
  if (companyResult.error) return jsonError(`Visitor approved, but the company name could not be loaded: ${companyResult.error.message}`, 500);

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `tgm-visitor-host-notification-${id}`,
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [host.email],
      subject: `${visitor.name} has arrived at ${companyResult.data.company_name}`,
      text: [
        `Hello ${host.name},`,
        "",
        `${visitor.name} has been approved by reception and is checked in to visit you.`,
        `Visitor email: ${visitor.email}`,
        `Company: ${visitor.company || "Not provided"}`,
        `Purpose: ${visitor.purpose}`,
        `Arrival time: ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`,
      ].join("\n"),
    }),
    cache: "no-store",
  });
  if (!emailResponse.ok) {
    const responseText = await emailResponse.text();
    return jsonError(`Visitor approved, but the host email could not be sent: ${responseText || emailResponse.statusText}`, 502);
  }

  const { error: notificationError } = await client
    .from("guests")
    .update({ host_notified_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", visitor.owner_id);
  if (notificationError) {
    return jsonError(`The email was sent, but its delivery status could not be saved: ${notificationError.message}`, 500);
  }

  return NextResponse.json({ approved: true, emailSent: true });
}
