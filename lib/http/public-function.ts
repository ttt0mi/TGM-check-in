import { supabaseConfig } from "@/lib/supabase/config";
import { requestError } from "./request-error";
import { MUTATION_TIMEOUT_MS, READ_TIMEOUT_MS, withRequestTimeout } from "./timeout";

export async function invokePublicFunction<T>(
	name: string,
	init: RequestInit,
	timeoutMs = init.method === "GET" ? READ_TIMEOUT_MS : MUTATION_TIMEOUT_MS,
): Promise<T> {
	const { url, key } = supabaseConfig();
	return withRequestTimeout(
		async (signal) => {
			const response = await fetch(`${url}/functions/v1/${name}`, {
				...init,
				signal,
				headers: {
					apikey: key,
					"Content-Type": "application/json",
					...init.headers,
				},
				cache: "no-store",
			});
			if (!response.ok) throw await requestError(response);
			return (await response.json()) as T;
		},
		timeoutMs,
		init.signal ?? undefined,
	);
}
