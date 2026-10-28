export const INTERACTIVE_AUTH_TIMEOUT_MS = 15_000;
export const SERVER_AUTH_TIMEOUT_MS = 10_000;
// Per Auth HTTP request. The Auth SDK may retry a refresh after this deadline.
export const PROXY_AUTH_TIMEOUT_MS = 5_000;

// Auth JS wraps fetch failures into AuthRetryableFetchError and retains the message.
export const AUTH_TIMEOUT_MARKER = "tgm_auth_transport_timeout";
export const AUTH_CANCELLED_MARKER = "tgm_auth_transport_cancelled";

export function createBoundedSupabaseFetch(timeoutMs: number): typeof fetch {
	return async (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		// Other Supabase services already have operation-specific limits, including
		// the longer report export limit. Bound only the Auth transport here.
		if (!new URL(url, "http://localhost").pathname.includes("/auth/v1/")) return fetch(input, init);

		const controller = new AbortController();
		const signals = [init?.signal, input instanceof Request ? input.signal : undefined].filter(
			(signal): signal is AbortSignal => Boolean(signal),
		);
		let timedOut = false;
		let cancelled = false;
		const cancel = () => {
			cancelled = true;
			controller.abort();
		};
		for (const signal of signals) signal.addEventListener("abort", cancel, { once: true });
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);
		try {
			if (signals.some((signal) => signal.aborted)) cancel();
			if (cancelled) throw new Error(AUTH_CANCELLED_MARKER);
			const response = await fetch(input, { ...init, signal: controller.signal });
			// Auth JS parses JSON after fetch returns; keep that body read inside
			// the same deadline without changing the response handed to Auth JS.
			await response.clone().arrayBuffer();
			if (timedOut) throw new Error(AUTH_TIMEOUT_MARKER);
			if (cancelled) throw new Error(AUTH_CANCELLED_MARKER);
			return response;
		} catch (cause) {
			if (timedOut) throw new Error(AUTH_TIMEOUT_MARKER);
			if (cancelled) throw new Error(AUTH_CANCELLED_MARKER);
			throw cause;
		} finally {
			clearTimeout(timer);
			for (const signal of signals) signal.removeEventListener("abort", cancel);
		}
	};
}
