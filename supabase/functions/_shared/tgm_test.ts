import { failure, HttpError, readJson } from "./tgm.ts";

Deno.test("readJson handles UTF-8 characters split across chunks", async () => {
	const bytes = new TextEncoder().encode('{"name":"é"}');
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes.slice(0, 10));
			controller.enqueue(bytes.slice(10));
			controller.close();
		},
	});
	const result = await readJson(new Request("http://localhost", { method: "POST", body: stream }));
	if (result.name !== "é") throw new Error("Split UTF-8 character was corrupted");
});

Deno.test("readJson cancels an oversized request body", async () => {
	let cancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new Uint8Array(9));
		},
		cancel() {
			cancelled = true;
		},
	});
	try {
		await readJson(new Request("http://localhost", { method: "POST", body: stream }), 8);
		throw new Error("Expected request to be rejected");
	} catch (error) {
		if (!(error instanceof HttpError) || error.status !== 413 || !cancelled) throw error;
	}
});

Deno.test("unexpected Edge failures do not log or return sensitive error text", async () => {
	const logged: unknown[] = [];
	const original = console.error;
	console.error = (...values: unknown[]) => logged.push(...values);
	try {
		const response = failure(new Error("visitor@example.com secret token"));
		const body = await response.json();
		if (response.status !== 500 || !/^[a-f0-9-]{36}$/.test(body.correlation_id)) throw new Error("Missing safe correlation ID");
		if (JSON.stringify(body).includes("visitor@example.com") || JSON.stringify(logged).includes("visitor@example.com"))
			throw new Error("Sensitive error text leaked");
	} finally {
		console.error = original;
	}
});
