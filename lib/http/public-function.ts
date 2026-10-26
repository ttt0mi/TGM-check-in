import { supabaseConfig } from "@/lib/supabase/config";
import { cancelledError, networkError, RequestError, requestError, timeoutError } from "./request-error";

export async function invokePublicFunction<T>(
	name: string,
	init: RequestInit,
	timeoutMs = init.method === "GET" ? 12000 : 25000,
): Promise<T> {
	const { url, key } = supabaseConfig();
	const controller = new AbortController();
	let timedOut = false;
	const cancel = () => controller.abort();
	if (init.signal?.aborted) throw cancelledError();
	init.signal?.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	try {
		const response = await fetch(`${url}/functions/v1/${name}`, {
			...init,
			signal: controller.signal,
			headers: {
				apikey: key,
				"Content-Type": "application/json",
				...init.headers,
			},
			cache: "no-store",
		});
		if (!response.ok) throw await requestError(response);
		return (await response.json()) as T;
	} catch (error) {
		if (timedOut) throw timeoutError();
		if (init.signal?.aborted) throw cancelledError();
		if (error instanceof RequestError) throw error;
		throw networkError();
	} finally {
		clearTimeout(timer);
		init.signal?.removeEventListener("abort", cancel);
	}
}
