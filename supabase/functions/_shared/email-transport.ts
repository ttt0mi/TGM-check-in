import { Resend } from "resend";

export type TransactionalEmail = {
	from: string;
	to: string[];
	subject: string;
	html: string;
	text: string;
};

export type EmailOutcome =
	| { status: "sent"; providerId: string }
	| { status: "unknown"; errorCode: string };

export async function sendTransactionalEmail(
	apiKey: string,
	email: TransactionalEmail,
	idempotencyKey: string,
): Promise<EmailOutcome> {
	try {
		const client = new Resend(apiKey, { baseUrl: "https://api.resend.com", userAgent: "tgm-edge" });
		// The pinned SDK logs complete provider errors outside NODE_ENV=production.
		// Our workflow records only a short status code, with no email or body data.
		Object.defineProperty(client, "logError", { value: () => {} });
		const { data, error } = await client.emails.send(email, { idempotencyKey });
		if (!error && data?.id) return { status: "sent", providerId: data.id };
		// Once the SDK starts delivery, even an HTTP error cannot prove that the
		// provider did not accept the email. Keep the workflow's unknown state.
		const status = error && "statusCode" in error ? error.statusCode : null;
		return {
			status: "unknown",
			errorCode: typeof status === "number" && status >= 100 && status <= 599
				? `resend_http_${status}`
				: "provider_outcome_unknown",
		};
	} catch {
		return { status: "unknown", errorCode: "provider_outcome_unknown" };
	}
}
