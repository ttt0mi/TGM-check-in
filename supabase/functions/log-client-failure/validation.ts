import { HttpError, uuid, type JsonObject } from "../_shared/tgm.ts";

const areas = new Set(["page", "public", "host", "operator"]);
const kinds = new Set(["render_failure", "network_failure", "realtime_failure"]);

export function validateDiagnostic(body: JsonObject) {
	if (Object.keys(body).some((key) => !["area", "kind", "correlation_id"].includes(key)))
		throw new HttpError(400, "Invalid diagnostic payload");
	const { area, kind } = body;
	if (typeof area !== "string" || !areas.has(area) || typeof kind !== "string" || !kinds.has(kind))
		throw new HttpError(400, "Invalid diagnostic category");
	return { area, kind, correlationId: uuid(body.correlation_id, "correlation ID") };
}
