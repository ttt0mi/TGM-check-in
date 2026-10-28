import { isAuthRetryableFetchError, isAuthSessionMissingError, type AuthError, type User } from "@supabase/supabase-js";
import { cancelledError, networkError, RequestError, timeoutError } from "@/lib/http/request-error";
import { AUTH_CANCELLED_MARKER, AUTH_TIMEOUT_MARKER } from "./transport";

export function authTransportError(error: unknown): RequestError | null {
	if (error instanceof RequestError) return error;
	const message = error instanceof Error ? error.message : "";
	if (message === AUTH_TIMEOUT_MARKER) return timeoutError();
	if (message === AUTH_CANCELLED_MARKER) return cancelledError();
	if (isAuthRetryableFetchError(error)) return networkError();
	return null;
}

export function safeAuthError(error: unknown): RequestError {
	const transport = authTransportError(error);
	if (transport) return transport;
	return new RequestError("unexpected", null, "The authentication service could not complete this request.");
}

// A definite missing/invalid session follows the existing anonymous route.
// Transport uncertainty must never be treated as proof of anonymity.
export async function verifiedUser(client: {
	auth: { getUser: () => Promise<{ data: { user: User | null }; error: AuthError | null }> };
}): Promise<User | null> {
	const { data, error } = await client.auth.getUser();
	if (error) {
		const transport = authTransportError(error);
		if (transport) throw transport;
		if (
			isAuthSessionMissingError(error) ||
			error.status === 401 ||
			error.status === 403 ||
			error.code === "session_not_found"
		)
			return null;
		throw safeAuthError(error);
	}
	return data.user;
}
