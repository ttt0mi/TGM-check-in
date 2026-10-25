import { supabaseConfig } from "@/lib/supabase/config";
import { networkError, requestError } from "./request-error";

export async function invokePublicFunction<T>(name: string, init: RequestInit): Promise<T> {
	const { url, key } = supabaseConfig();
	const response = await fetch(`${url}/functions/v1/${name}`, {
		...init,
		headers: {
			apikey: key,
			"Content-Type": "application/json",
			...init.headers,
		},
		cache: "no-store",
	}).catch(() => {
		throw networkError();
	});
	if (!response.ok) throw await requestError(response);
	return (await response.json()) as T;
}
