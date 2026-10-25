export function parseAppOrigin(source: string | undefined, allowLocalhost = false): string {
	if (!source) throw new Error("APP_ORIGIN is required");
	let url: URL;
	try {
		url = new URL(source);
	} catch {
		throw new Error("APP_ORIGIN must be a valid origin");
	}
	const localHttp = allowLocalhost && url.protocol === "http:" &&
		["localhost", "127.0.0.1"].includes(url.hostname);
	if ((!localHttp && url.protocol !== "https:") || url.username || url.password ||
		url.pathname !== "/" || url.search || url.hash) {
		throw new Error("APP_ORIGIN must be an HTTPS origin");
	}
	return url.origin;
}
