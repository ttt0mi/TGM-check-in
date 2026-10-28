import { MUTATION_TIMEOUT_MS, withRequestTimeout } from "./timeout";

export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = MUTATION_TIMEOUT_MS) {
	return withRequestTimeout(
		async (signal) => {
			const response = await fetch(input, { ...init, signal });
			const body =
				response.status === 204 || response.status === 205 || response.status === 304
					? null
					: await response.arrayBuffer();
			return new Response(body, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		},
		timeoutMs,
		init.signal ?? undefined,
	);
}
