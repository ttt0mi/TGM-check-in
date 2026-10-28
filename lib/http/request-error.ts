export type RequestFailureKind =
	| "invalid"
	| "unauthorized"
	| "forbidden"
	| "missing"
	| "conflict"
	| "rate_limited"
	| "unavailable"
	| "timeout"
	| "cancelled"
	| "unexpected";

export class RequestError extends Error {
	constructor(
		public readonly kind: RequestFailureKind,
		public readonly status: number | null,
		message: string,
		public readonly correlationId?: string,
		public readonly code?: string,
	) {
		super(correlationId ? `${message} Reference: ${correlationId}.` : message);
		this.name = "RequestError";
	}
}

function kindForStatus(status: number): RequestFailureKind {
	if (status === 400 || status === 422) return "invalid";
	if (status === 401) return "unauthorized";
	if (status === 403) return "forbidden";
	if (status === 404 || status === 410) return "missing";
	if (status === 409) return "conflict";
	if (status === 408) return "timeout";
	if (status === 429) return "rate_limited";
	if (status === 412 || status === 503 || status === 504) return "unavailable";
	return "unexpected";
}

function safeMessage(status: number, code: string | undefined): string {
	const known: Record<string, string> = {
		admin_required: "You need active administrator access for this action.",
		organization_forbidden: "You cannot change another organization's records.",
		notice_invalid: "Check the notice copy and HTTPS policy URL.",
		active_visits: "Resolve this person's active visits before making this change.",
		staff_dependencies: "Resolve this staff member's active assignments before making this change.",
		resource_inactive: "This item is inactive. Refresh the list and choose an active item.",
		provider_unknown: "The outcome is unclear. Check the record before trying again.",
		invitation_invalid: "This invitation link is invalid or no longer available.",
		invitation_expired: "This invitation has expired. Ask an administrator for a new one.",
		invitation_used: "This invitation has already been accepted.",
		invitation_wrong_email: "Sign in with the email address shown on the invitation.",
		invitation_unavailable: "The invited organization or branch is unavailable.",
		organization_unavailable: "Organization signup is not available right now.",
	};
	if (code && known[code]) return known[code];
	if (status === 429) return "Too many attempts. Please wait and try again.";
	if (status === 401) return "Sign in and try again.";
	if (status === 403) return "You do not have access to this action.";
	if (status === 404 || status === 410) return "This item is no longer available.";
	if (status === 409) return "This action conflicts with the current state. Refresh and try again.";
	if (status === 408) return "This request took too long. Check its status before retrying.";
	if (status >= 500) return "This service is temporarily unavailable. Please try again.";
	return "Please check the details and try again.";
}

export async function requestError(response: Response): Promise<RequestError> {
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		body = null;
	}
	const data = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
	const id =
		typeof data.correlation_id === "string" && /^[a-f0-9-]{36}$/i.test(data.correlation_id)
			? data.correlation_id
			: undefined;
	const code = typeof data.code === "string" && /^[a-z_]{1,64}$/.test(data.code) ? data.code : undefined;
	return new RequestError(
		kindForStatus(response.status),
		response.status,
		safeMessage(response.status, code),
		id,
		code,
	);
}

export async function functionError(error: unknown, response?: Response): Promise<RequestError> {
	if (response) return requestError(response.clone());
	if (error && typeof error === "object" && "context" in error && error.context instanceof Response)
		return requestError(error.context.clone());
	return networkError();
}

export function postgrestError(error: { code: string }): RequestError {
	if (error.code === "PGRST301" || error.code === "PGRST302")
		return new RequestError(
			"unauthorized",
			401,
			"Your session has expired. Sign in and try again.",
			undefined,
			error.code,
		);
	if (error.code === "22023" || error.code === "22P02")
		return new RequestError("invalid", 400, "Check the details and try again.", undefined, error.code);
	if (error.code === "42501" || error.code === "PT403")
		return new RequestError("forbidden", 403, "You do not have access to this action.", undefined, error.code);
	if (error.code === "23505" || error.code === "PT409")
		return new RequestError("conflict", 409, "A record with these details already exists.", undefined, error.code);
	if (error.code === "23503" || error.code === "23514" || error.code === "P0001")
		return new RequestError(
			"conflict",
			409,
			"This change conflicts with a related record or current state.",
			undefined,
			error.code,
		);
	if (/^PGRST00[0-3]$/.test(error.code) || /^08/.test(error.code) || /^53/.test(error.code))
		return new RequestError(
			"unavailable",
			503,
			"The data service is temporarily unavailable. Please retry.",
			undefined,
			error.code,
		);
	const correlationId = crypto.randomUUID();
	return new RequestError("unexpected", null, "This request could not be completed.", correlationId, error.code);
}

export function networkError(): RequestError {
	if (typeof navigator !== "undefined" && navigator.onLine === false)
		return new RequestError("unavailable", null, "You appear to be offline. Reconnect and try again.");
	return new RequestError("unavailable", null, "Connection unavailable. Check your connection and try again.");
}

export function timeoutError(): RequestError {
	return new RequestError("timeout", null, "This request took too long. Check its status before retrying.");
}

export function cancelledError(): RequestError {
	return new RequestError("cancelled", null, "Request cancelled.");
}
