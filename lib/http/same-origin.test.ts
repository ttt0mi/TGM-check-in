import { describe, expect, it } from "vitest";
import { isSameOriginPost } from "./same-origin";

function request(origin: string | null, host = "127.0.0.1:3100") {
	const headers = new Headers({ host });
	if (origin) headers.set("origin", origin);
	return new Request("http://localhost:3100/api/invitation/preserve", {
		method: "POST",
		headers,
	});
}

describe("invitation request origin", () => {
	it("accepts the browser origin matching the Host header", () => {
		expect(isSameOriginPost(request("http://127.0.0.1:3100"))).toBe(true);
	});

	it("rejects missing, cross-site, and different-scheme origins", () => {
		expect(isSameOriginPost(request(null))).toBe(false);
		expect(isSameOriginPost(request("http://elsewhere.example"))).toBe(false);
		expect(isSameOriginPost(request("https://127.0.0.1:3100"))).toBe(false);
	});
});
