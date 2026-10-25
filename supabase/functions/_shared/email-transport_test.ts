import { sendTransactionalEmail } from "./email-transport.ts";

const email = {
	from: "TGM <visits@example.com>",
	to: ["host@example.com"],
	subject: "Visitor decision",
	html: "<p>Visitor</p>",
	text: "Visitor",
};

Deno.test("Resend SDK delivery includes text and an idempotency key", async () => {
	const originalFetch = globalThis.fetch;
	let sent = false;
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		if (request.url !== "https://api.resend.com/emails") throw new Error("Unexpected URL");
		if (request.headers.get("idempotency-key") !== "tgm-host-test") throw new Error("Missing idempotency key");
		if (request.headers.get("authorization") !== "Bearer re_test") throw new Error("Missing API key");
		const body = await request.json() as { text?: string };
		if (body.text !== "Visitor") throw new Error("Plain-text alternative missing");
		sent = true;
		return Response.json({ id: "provider-1" });
	};
	try {
		const result = await sendTransactionalEmail("re_test", email, "tgm-host-test");
		if (!sent || result.status !== "sent" || result.providerId !== "provider-1")
			throw new Error(`Successful SDK result was not classified as sent: ${JSON.stringify({ sent, result })}`);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

Deno.test("Resend SDK HTTP failure preserves the unknown delivery state", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = () => Promise.resolve(Response.json({ name: "internal_server_error", message: "Provider unavailable", statusCode: 503 }, { status: 503 }));
	try {
		const result = await sendTransactionalEmail("re_test", email, "tgm-host-test-2");
		if (result.status !== "unknown" || result.errorCode !== "resend_http_503")
			throw new Error(`Ambiguous SDK response was not classified as unknown: ${JSON.stringify(result)}`);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

Deno.test("Resend SDK network failure preserves the unknown delivery state", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = () => Promise.reject(new TypeError("Network unavailable"));
	try {
		const result = await sendTransactionalEmail("re_test", email, "tgm-host-test-3");
		if (result.status !== "unknown" || result.errorCode !== "provider_outcome_unknown")
			throw new Error("Ambiguous network outcome was not classified as unknown");
	} finally {
		globalThis.fetch = originalFetch;
	}
});
