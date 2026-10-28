export function isSameOriginPost(request: Request) {
	const origin = request.headers.get("origin");
	const host = request.headers.get("host");
	if (!origin || !host) return false;
	try {
		const parsed = new URL(origin);
		const protocol = process.env.NODE_ENV === "production" ? "https:" : "http:";
		return parsed.origin === origin && parsed.host === host && parsed.protocol === protocol;
	} catch {
		return false;
	}
}
