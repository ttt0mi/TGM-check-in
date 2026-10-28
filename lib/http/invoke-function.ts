import { createClient } from "@/lib/supabase/browser";
import { functionError, RequestError } from "./request-error";
import { MUTATION_TIMEOUT_MS, withRequestTimeout } from "./timeout";

export async function invokeFunction<T>(
	name: string,
	body: Record<string, unknown>,
	timeoutMs = MUTATION_TIMEOUT_MS,
	userSignal?: AbortSignal,
): Promise<T> {
	return withRequestTimeout(
		async (signal) => {
			const { data, error, response } = await createClient().functions.invoke<T>(name, { body, signal });
			if (error) throw await functionError(error, response);
			if (data === null)
				throw new RequestError(
					"unexpected",
					null,
					"The service returned an invalid response.",
					crypto.randomUUID(),
				);
			return data;
		},
		timeoutMs,
		userSignal,
	);
}
