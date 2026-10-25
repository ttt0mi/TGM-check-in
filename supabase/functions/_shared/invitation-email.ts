import { env, HttpError } from "./tgm.ts";

export function appOrigin() {
  const source = Deno.env.get("APP_ORIGIN") || Deno.env.get("HOST_DECISION_ORIGIN");
  if (!source) throw new Error("APP_ORIGIN is required");
  const url = new URL(source);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("APP_ORIGIN must be an HTTPS origin");
  }
  return url.origin;
}

export function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function invitationEmailConfig() {
  const apiKey = env("RESEND_API_KEY");
  const from = env("RESEND_FROM_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) throw new Error("Invalid RESEND_FROM_EMAIL");
  return { apiKey, from, origin: appOrigin() };
}

export async function sendInvitationEmail(
  config: ReturnType<typeof invitationEmailConfig>,
  input: { invitationId: string; token: string; email: string; organization: string; role: string; branch: string | null },
) {
  const link = new URL("/invite", config.origin);
  link.hash = new URLSearchParams({ token: input.token }).toString();
  const detail = input.branch ? ` at ${input.branch}` : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `tgm-invite-${input.invitationId}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.email],
      subject: `Invitation to ${input.organization}`,
      html: `<p>You were invited as ${htmlEscape(input.role)}${htmlEscape(detail)} at ${htmlEscape(input.organization)}.</p>` +
        `<p><a href="${htmlEscape(link.toString())}">Accept your invitation</a></p>` +
        "<p>This link expires in seven days. Sign in or create an account using this email address.</p>",
    }),
  });
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!response.ok || !body?.id) throw new HttpError(502, "Invitation email could not be confirmed");
  return body.id;
}
