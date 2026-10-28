import { env } from "./tgm.ts";
import { appOrigin } from "./app-origin.ts";
import { htmlEscape } from "./email-format.ts";
import { sendTransactionalEmail } from "./email-transport.ts";

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
  return sendTransactionalEmail(config.apiKey, {
      from: config.from,
      to: [input.email],
      subject: `Invitation to ${input.organization}`,
      html: `<p>You were invited as ${htmlEscape(input.role)}${htmlEscape(detail)} at ${htmlEscape(input.organization)}.</p>` +
        `<p><a href="${htmlEscape(link.toString())}">Accept your invitation</a></p>` +
        "<p>This link expires in seven days. Sign in or create an account using this email address.</p>",
      text: `You were invited as ${input.role}${detail} at ${input.organization}.\n\nAccept your invitation: ${link.toString()}\n\nThis link expires in seven days. Sign in or create an account using this email address.`,
  }, `tgm-invite-${input.invitationId}-${crypto.randomUUID()}`);
}
