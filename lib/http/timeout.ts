import { cancelledError, networkError, RequestError, timeoutError } from "./request-error";

export const READ_TIMEOUT_MS = 12_000;
export const MUTATION_TIMEOUT_MS = 25_000;
export const EMAIL_TIMEOUT_MS = 30_000;
export const EXPORT_TIMEOUT_MS = 120_000;

/** Bounds one request and releases its timer and cancellation listener on every exit. */
export async function withRequestTimeout<T>(
	request: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
	userSignal?: AbortSignal,
): Promise<T> {
	if (userSignal?.aborted) throw cancelledError();
	const controller = new AbortController();
	let timedOut = false;
	const cancel = () => controller.abort();
	userSignal?.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	try {
		const result = await request(controller.signal);
		if (timedOut) throw timeoutError();
		if (userSignal?.aborted) throw cancelledError();
		return result;
	} catch (error) {
		if (timedOut) throw timeoutError();
		if (userSignal?.aborted) throw cancelledError();
		if (error instanceof RequestError) throw error;
		throw networkError();
	} finally {
		clearTimeout(timer);
		userSignal?.removeEventListener("abort", cancel);
	}
}
