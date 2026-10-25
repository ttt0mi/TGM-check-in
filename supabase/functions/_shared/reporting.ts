import type { SupabaseContext } from "@supabase/server";
import type { Database } from "./database.ts";
import { authenticatedOperator, HttpError, readJson, uuid } from "./tgm.ts";

type Operator = Awaited<ReturnType<typeof authenticatedOperator>>;
type ReportVisit = Pick<Database["public"]["Tables"]["visits"]["Row"],
  "id" | "location_id" | "staff_id" | "visitor_full_name" | "visitor_preferred_name" |
  "visitor_email" | "phone_number" | "organization" | "purpose" | "visit_type" |
  "status" | "check_in_method" | "arrived_at" | "admitted_at" | "time_out">;
export type ReportBranch = { id: string; name: string; timezone: string };
type DateRange = { start: string; end: string };

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return date;
}

export function localParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const read = (name: string) => parts.find(part => part.type === name)?.value ?? "";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, hour: Number(read("hour")) };
}

function branchRange(preset: string, timezone: string, custom: DateRange): DateRange {
  if (preset === "custom") return custom;
  const today = localParts(new Date().toISOString(), timezone).date;
  const date = new Date(`${today}T00:00:00.000Z`);
  if (preset === "7d") date.setUTCDate(date.getUTCDate() - 6);
  if (preset === "30d") date.setUTCDate(date.getUTCDate() - 29);
  if (preset === "mtd") date.setUTCDate(1);
  return { start: date.toISOString().slice(0, 10), end: today };
}

export async function loadReport(req: Request, ctx: SupabaseContext<Database>) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const operator: Operator = await authenticatedOperator(ctx);
  const body = await readJson(req, 4096);
  const preset = body.preset ?? "custom";
  if (!["custom", "today", "7d", "30d", "mtd"].includes(preset as string)) {
    throw new HttpError(400, "Invalid date preset");
  }
  const custom: DateRange = preset === "custom"
    ? { start: parseDate(body.start_date, "start date").toISOString().slice(0, 10),
      end: parseDate(body.end_date, "end date").toISOString().slice(0, 10) }
    : { start: "", end: "" };
  if (preset === "custom") {
    const days = (parseDate(custom.end, "end date").getTime() - parseDate(custom.start, "start date").getTime()) / 86_400_000 + 1;
    if (days < 1 || days > 366) throw new HttpError(400, "Choose a range of up to 366 days");
  }
  const requestedLocation = body.location_id == null ? null : uuid(body.location_id, "branch");
  if (operator.role === "receptionist" && requestedLocation && requestedLocation !== operator.locationId) {
    throw new HttpError(403, "Branch access denied");
  }
  const locationId = operator.role === "receptionist" ? operator.locationId : requestedLocation;
  const { data: allBranches, error: branchError } = await operator.service.from("locations")
    .select("id,name,timezone").eq("organization_id", operator.organizationId);
  if (branchError) throw branchError;
  const branches = locationId ? (allBranches ?? []).filter(branch => branch.id === locationId) : allBranches ?? [];
  if (locationId && branches.length !== 1) throw new HttpError(403, "Branch access denied");
  const branchById = new Map(branches.map(branch => [branch.id, branch]));
  const ranges = new Map(branches.map(branch => [branch.id, branchRange(preset as string, branch.timezone, custom)]));
  const visits: ReportVisit[] = [];
  if (branches.length) {
    const firstDate = [...ranges.values()].map(range => range.start).sort()[0];
    const lastDate = [...ranges.values()].map(range => range.end).sort().at(-1)!;
    const lower = new Date(parseDate(firstDate, "start date").getTime() - 2 * 86_400_000).toISOString();
    const upper = new Date(parseDate(lastDate, "end date").getTime() + 3 * 86_400_000).toISOString();
    for (let offset = 0; ; offset += 1000) {
      if (offset > 50_000) throw new HttpError(413, "Report exceeds 50,000 visits; narrow the date range");
      const { data, error } = await operator.service.from("visits")
        .select("id,location_id,staff_id,visitor_full_name,visitor_preferred_name,visitor_email,phone_number,organization,purpose,visit_type,status,check_in_method,arrived_at,admitted_at,time_out")
        .eq("organization_id", operator.organizationId)
        .in("location_id", branches.map(branch => branch.id))
        .gte("arrived_at", lower).lt("arrived_at", upper)
        .order("arrived_at", { ascending: true }).order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      for (const visit of data ?? []) {
        const branch = branchById.get(visit.location_id);
        if (!branch) continue;
        const date = localParts(visit.arrived_at, branch.timezone).date;
        const range = ranges.get(branch.id)!;
        if (date >= range.start && date <= range.end) visits.push(visit);
      }
      if (visits.length > 50_000) throw new HttpError(413, "Report exceeds 50,000 visits; narrow the date range");
      if (!data || data.length < 1000) break;
    }
  }
  return { operator, branches, branchById, visits,
    preset: preset as string, ranges: Object.fromEntries(ranges),
    startDate: preset === "custom" ? custom.start : preset as string,
    endDate: preset === "custom" ? custom.end : preset as string };
}

export function summarizeReport(input: Awaited<ReturnType<typeof loadReport>>) {
  const statuses: Record<string, number> = {};
  const types: Record<string, number> = {};
  const methods: Record<string, number> = {};
  const branchCounts: Record<string, number> = {};
  const daily: Record<string, number> = {};
  const hours: Record<string, number> = {};
  let durationTotal = 0;
  let durationCount = 0;
  for (const visit of input.visits) {
    const branch = input.branchById.get(visit.location_id)!;
    const local = localParts(visit.arrived_at, branch.timezone);
    statuses[visit.status] = (statuses[visit.status] ?? 0) + 1;
    types[visit.visit_type] = (types[visit.visit_type] ?? 0) + 1;
    methods[visit.check_in_method] = (methods[visit.check_in_method] ?? 0) + 1;
    branchCounts[branch.name] = (branchCounts[branch.name] ?? 0) + 1;
    daily[local.date] = (daily[local.date] ?? 0) + 1;
    hours[String(local.hour).padStart(2, "0")] = (hours[String(local.hour).padStart(2, "0")] ?? 0) + 1;
    if (visit.time_out) {
      const begin = visit.admitted_at ?? visit.arrived_at;
      const minutes = (new Date(visit.time_out).getTime() - new Date(begin).getTime()) / 60000;
      if (minutes >= 0) { durationTotal += minutes; durationCount++; }
    }
  }
  const series = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
  return { total: input.visits.length, statuses, visit_types: types, check_in_methods: methods,
    branches: branchCounts, series, hours,
    average_duration_minutes: durationCount ? Math.round(durationTotal / durationCount) : null,
    start_date: input.preset === "custom" ? input.startDate : null,
    end_date: input.preset === "custom" ? input.endDate : null,
    preset: input.preset, branch_ranges: input.ranges,
    timezone_policy: "each_branch_local_day" };
}

export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function csvReport(input: Awaited<ReturnType<typeof loadReport>>) {
  if (input.operator.role !== "admin") throw new HttpError(403, "Admin access required");
  const { data: staff, error } = await input.operator.service.from("staff")
    .select("id,full_name,preferred_name").eq("organization_id", input.operator.organizationId);
  if (error) throw error;
  const hostById = new Map((staff ?? []).map(member => [member.id, member.preferred_name || member.full_name]));
  const header = ["Visit ID", "Branch", "Branch time zone", "Arrival UTC", "Arrival local", "Status",
    "Visit type", "Check-in method", "Visitor name", "Preferred name", "Email", "Phone",
    "Visitor organization", "Host", "Purpose", "Admission UTC", "Checkout UTC"];
  const rows = input.visits.map(visit => {
    const branch = input.branchById.get(visit.location_id)!;
    const localArrival = new Intl.DateTimeFormat("en-GB", {
      timeZone: branch.timezone, dateStyle: "short", timeStyle: "medium", hourCycle: "h23",
    }).format(new Date(visit.arrived_at));
    return [visit.id, branch.name, branch.timezone, visit.arrived_at, localArrival,
      visit.status, visit.visit_type, visit.check_in_method, visit.visitor_full_name,
      visit.visitor_preferred_name, visit.visitor_email, visit.phone_number,
      visit.organization, visit.staff_id ? hostById.get(visit.staff_id) : null,
      visit.purpose, visit.admitted_at, visit.time_out].map(csvCell).join(",");
  });
  return [header.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
