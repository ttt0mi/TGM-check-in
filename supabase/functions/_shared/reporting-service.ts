import type { SupabaseContext } from "@supabase/server";
import type { Database } from "./database.ts";
import { csvCell } from "./reporting-utils.ts";
import { authenticatedOperator, HttpError, readJson, uuid } from "./tgm.ts";

type Operator = Awaited<ReturnType<typeof authenticatedOperator>>;
type Scope = {
	p_actor_id: string;
	p_location_id?: string;
	p_preset: string;
	p_start_date?: string;
	p_end_date?: string;
};

function dateInput(value: unknown, label: string): string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw new HttpError(400, `Invalid ${label}`);
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
		throw new HttpError(400, `Invalid ${label}`);
	return value;
}

export async function reportRequest(req: Request, ctx: SupabaseContext<Database>, adminOnly = false) {
	if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
	const operator: Operator = await authenticatedOperator(ctx);
	if (adminOnly && operator.role !== "admin") throw new HttpError(403, "Admin access required");
	const body = await readJson(req, 4096);
	if (body.redacted != null && typeof body.redacted !== "boolean")
		throw new HttpError(400, "Invalid redaction choice");
	const preset = body.preset ?? "7d";
	if (typeof preset !== "string" || !["today", "7d", "30d", "mtd", "custom"].includes(preset))
		throw new HttpError(400, "Invalid date preset");
	const start = preset === "custom" ? dateInput(body.start_date, "start date") : null;
	const end = preset === "custom" ? dateInput(body.end_date, "end date") : null;
	if (start && end) {
		const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
		if (days < 1 || days > 366) throw new HttpError(400, "Choose a range of up to 366 days");
	}
	const requestedLocation = body.location_id == null ? null : uuid(body.location_id, "branch");
	if (operator.role === "receptionist" && requestedLocation && requestedLocation !== operator.locationId)
		throw new HttpError(403, "Branch access denied");
	const locationId = operator.role === "receptionist" ? operator.locationId : requestedLocation;
	if (locationId) {
		const { data, error } = await operator.service.from("locations")
			.select("id").eq("organization_id", operator.organizationId)
			.eq("id", locationId).maybeSingle();
		if (error || !data) throw new HttpError(403, "Branch access denied");
	}
	const scope: Scope = {
		p_actor_id: operator.userId,
		p_location_id: locationId ?? undefined,
		p_preset: preset,
		p_start_date: start ?? undefined,
		p_end_date: end ?? undefined,
	};
	return { operator, scope, redacted: body.redacted === true };
}

export async function aggregateReport(req: Request, ctx: SupabaseContext<Database>) {
	const { operator, scope } = await reportRequest(req, ctx);
	const { data, error } = await operator.service.rpc("tgm_visit_report_aggregate", scope);
	if (error) throw error;
	return data;
}

const header = ["Visit ID", "Branch", "Branch time zone", "Arrival UTC", "Arrival local", "Status",
	"Visit type", "Check-in method", "Visitor name", "Preferred name", "Email", "Phone",
	"Visitor organization", "Host", "Purpose", "Admission UTC", "Checkout UTC"];

export async function streamCsvReport(req: Request, ctx: SupabaseContext<Database>): Promise<Response> {
	const { operator, scope, redacted } = await reportRequest(req, ctx, true);
	const { data: auditId, error: auditError } = await operator.service.rpc("tgm_start_visit_export", {
		...scope, p_location_id: scope.p_location_id ?? null,
		p_start_date: scope.p_start_date ?? null, p_end_date: scope.p_end_date ?? null,
		p_redacted: redacted,
	});
	if (auditError || !auditId) throw auditError ?? new Error("Export audit failed");
	const encoder = new TextEncoder();
	let cursor: { arrived_at: string; id: string } | null = null;
	let started = false;
	let rowCount = 0;
	const localFormatters = new Map<string, Intl.DateTimeFormat>();
	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				if (!started) {
					started = true;
					controller.enqueue(encoder.encode(`${header.map(csvCell).join(",")}\r\n`));
					return;
				}
				const { data, error } = await operator.service.rpc("tgm_visit_report_page", {
					...scope,
					p_after_arrived_at: cursor?.arrived_at ?? undefined,
					p_after_id: cursor?.id ?? undefined,
					p_limit: 501,
				});
				if (error) throw error;
				const rows = (data ?? []).slice(0, 500);
				if (rows.length) {
					const lines = rows.map((visit) => {
						let formatter = localFormatters.get(visit.branch_timezone);
						if (!formatter) {
							formatter = new Intl.DateTimeFormat("en-GB", {
								timeZone: visit.branch_timezone, dateStyle: "short", timeStyle: "medium", hourCycle: "h23",
							});
							localFormatters.set(visit.branch_timezone, formatter);
						}
						const localArrival = formatter.format(new Date(visit.arrived_at));
						return [visit.id, visit.branch_name, visit.branch_timezone, visit.arrived_at, localArrival,
							visit.status, visit.visit_type, visit.check_in_method,
							redacted ? "" : visit.visitor_full_name,
							redacted ? "" : visit.visitor_preferred_name,
							redacted ? "" : visit.visitor_email,
							redacted ? "" : visit.phone_number,
							redacted ? "" : visit.visitor_organization,
							redacted ? "" : visit.host_name,
							redacted ? "" : visit.purpose,
							visit.admitted_at, visit.time_out].map(csvCell).join(",");
					});
					controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
					rowCount += rows.length;
				}
				if ((data ?? []).length <= 500) {
					const { error: finishError } = await operator.service.rpc("tgm_finish_visit_export", {
						p_actor_id: operator.userId, p_export_id: auditId, p_row_count: rowCount,
					});
					if (finishError) throw finishError;
					controller.close();
				} else {
					const last = rows.at(-1)!;
					cursor = { arrived_at: last.arrived_at, id: last.id };
				}
			} catch (error) {
				controller.error(error);
			}
		},
	});
	const filename = `tgm-visits-${scope.p_location_id ? scope.p_location_id.slice(0, 8) : "all"}-${
		scope.p_preset === "custom" ? `${scope.p_start_date}-${scope.p_end_date}` : scope.p_preset
	}${redacted ? "-redacted" : ""}.csv`;
	return new Response(stream, { headers: {
		"Content-Type": "text/csv; charset=utf-8",
		"Content-Disposition": `attachment; filename="${filename}"`,
		"Access-Control-Expose-Headers": "Content-Disposition",
		"Cache-Control": "no-store, private",
		"X-Content-Type-Options": "nosniff",
	} });
}
