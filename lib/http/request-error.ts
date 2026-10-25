export type RequestFailureKind =
	"invalid" | "unauthorized" | "forbidden" | "missing" | "conflict" | "rate_limited" | "unavailable" | "unexpected";

export class RequestError extends Error {
	constructor(
		public readonly kind: RequestFailureKind,
		public readonly status: number | null,
		message: string,
		public readonly correlationId?: string,
	) {
		super(message);
		this.name = "RequestError";
	}
}

function kindForStatus(status: number): RequestFailureKind {
	if (status === 400 || status === 422) return "invalid";
	if (status === 401) return "unauthorized";
	if (status === 403) return "forbidden";
	if (status === 404 || status === 410) return "missing";
	if (status === 409) return "conflict";
	if (status === 429) return "rate_limited";
	if (status === 412 || status === 503 || status === 504) return "unavailable";
	return "unexpected";
}

function safeMessage(status: number, supplied: unknown): string {
	if (status >= 500) return "This service is temporarily unavailable. Please try again.";
	if (typeof supplied === "string" && supplied.length <= 240 && !/[\r\n<>]/.test(supplied)) return supplied;
	return status === 429 ? "Too many attempts. Please wait and try again." : "This request could not be completed.";
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
	return new RequestError(
		kindForStatus(response.status),
		response.status,
		safeMessage(response.status, data.error),
		id,
	);
}

export function networkError(): RequestError {
	return new RequestError("unavailable", null, "Connection unavailable. Check your connection and try again.");
}
