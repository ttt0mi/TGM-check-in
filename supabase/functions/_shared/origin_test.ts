import { parseAppOrigin } from "./origin.ts";

Deno.test("canonical origin requires HTTPS outside explicit local development", () => {
	if (parseAppOrigin("https://reception.tgmeducation.net/") !== "https://reception.tgmeducation.net")
		throw new Error("HTTPS origin was not canonicalized");
	for (const value of [
		"http://localhost:3000", "https://example.test/path", "https://example.test/?x=1",
		"https://user:pass@example.test", "https://example.test/#token",
	]) {
		let rejected = false;
		try { parseAppOrigin(value); } catch { rejected = true; }
		if (!rejected) throw new Error(`Unsafe origin was accepted: ${value}`);
	}
	if (parseAppOrigin("http://localhost:3000", true) !== "http://localhost:3000")
		throw new Error("Explicit local origin was rejected");
});
