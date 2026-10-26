"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/browser";
import { networkError, requestError, RequestError } from "@/lib/http/request-error";
import { reportClientFailure } from "@/lib/observability/client";
import { reportLabel, reportSchema } from "./report-schema";
import styles from "./analytics.module.css";

type Branch = { id: string; name: string; timezone: string };
type Preset = "today" | "7d" | "30d" | "mtd" | "custom";

function displayDay(date: string) {
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
		new Date(`${date}T12:00:00Z`),
	);
}

export function AnalyticsDashboard({ role, branches }: { role: "admin" | "receptionist"; branches: Branch[] }) {
	const [queryClient] = useState(() => new QueryClient());
	return (
		<QueryClientProvider client={queryClient}>
			<Content role={role} branches={branches} />
		</QueryClientProvider>
	);
}

function Content({ role, branches }: { role: "admin" | "receptionist"; branches: Branch[] }) {
	const [preset, setPreset] = useState<Preset>("7d");
	const [locationId, setLocationId] = useState(role === "admin" ? "" : (branches[0]?.id ?? ""));
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [appliedCustom, setAppliedCustom] = useState<{ start: string; end: string } | null>(null);
	const [redacted, setRedacted] = useState(false);
	const [exportBusy, setExportBusy] = useState(false);
	const exportInFlight = useRef(false);
	const [exportError, setExportError] = useState("");
	const body =
		preset === "custom"
			? {
					preset,
					start_date: appliedCustom?.start,
					end_date: appliedCustom?.end,
					...(locationId ? { location_id: locationId } : {}),
				}
			: { preset, ...(locationId ? { location_id: locationId } : {}) };
	const customDays =
		startDate && endDate
			? (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1
			: 0;
	const customValid = customDays >= 1 && customDays <= 366;
	const valid = preset !== "custom" || appliedCustom !== null;
	const query = useQuery({
		queryKey: ["analytics", body],
		enabled: valid,
		staleTime: 60_000,
		refetchOnWindowFocus: false,
		retry: 1,
		queryFn: async ({ signal }) => {
			const timeout = AbortSignal.timeout(30000);
			const { data, error, response } = await createClient().functions.invoke("get-visit-analytics", {
				body,
				signal: AbortSignal.any([signal, timeout]),
			});
			if (timeout.aborted) throw new RequestError("timeout", null, "Report request timed out. Please retry.");
			if (error) throw response ? await requestError(response.clone()) : networkError();
			const parsed = reportSchema.safeParse(data);
			if (!parsed.success) {
				reportClientFailure("operator", "network_failure");
				throw new Error("Report response is incompatible. Please try again later.");
			}
			return parsed.data;
		},
	});

	async function exportCsv() {
		if (exportInFlight.current || !valid || !query.data) return;
		const scope = locationId
			? (branches.find((branch) => branch.id === locationId)?.name ?? "selected branch")
			: "all branches";
		if (
			!window.confirm(
				`Export ${redacted ? "redacted" : "full"} visit records for ${scope} (${preset === "custom" ? `${appliedCustom?.start} through ${appliedCustom?.end}` : preset})? ${redacted ? "Visitor and host details will be blank." : "This file contains visitor personal information. Store and share it carefully."}`,
			)
		)
			return;
		exportInFlight.current = true;
		setExportBusy(true);
		setExportError("");
		try {
			const timeout = AbortSignal.timeout(120000);
			const { data, error, response } = await createClient().functions.invoke("export-visit-report", {
				body: { ...body, redacted },
				signal: timeout,
			});
			if (timeout.aborted)
				throw new RequestError("timeout", null, "Export timed out. Check report history before retrying.");
			if (error) throw response ? await requestError(response.clone()) : networkError();
			if (typeof data !== "string") throw new Error("Export response is incompatible. Please retry.");
			const disposition = response?.headers.get("Content-Disposition") ?? "";
			const serverFilename = disposition.match(/filename="([A-Za-z0-9._-]{1,120}\.csv)"/i)?.[1];
			const filename = serverFilename ?? `tgm-visits-${preset}${redacted ? "-redacted" : ""}.csv`;
			const blob = new Blob([data], { type: "text/csv;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (cause) {
			setExportError(
				cause instanceof RequestError ? cause.message : "Export could not be completed. Please retry.",
			);
		} finally {
			exportInFlight.current = false;
			setExportBusy(false);
		}
	}

	const hours = Object.entries(query.data?.hours ?? {})
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([hour, count]) => ({ hour: `${hour}:00`, count }));
	return (
		<main id="main-content" className={styles.page}>
			<Link href="/app">← Visits</Link>
			<h1>Visit analytics</h1>
			<div className={styles.filters}>
				{role === "admin" && (
					<label>
						Branch{" "}
						<select
							value={locationId}
							onChange={(event) => {
								setLocationId(event.target.value);
								setExportError("");
							}}
						>
							<option value="">All branches</option>
							{branches.map((branch) => (
								<option key={branch.id} value={branch.id}>
									{branch.name}
								</option>
							))}
						</select>
					</label>
				)}
				{role === "receptionist" && <p>Branch: {branches[0]?.name ?? "Unassigned"}</p>}
				<fieldset>
					<legend>Date range</legend>
					{(["today", "7d", "30d", "mtd", "custom"] as const).map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={preset === value}
							onClick={() => {
								setPreset(value);
								setExportError("");
							}}
						>
							{
								{
									today: "Today",
									"7d": "7 days",
									"30d": "30 days",
									mtd: "Month to date",
									custom: "Custom",
								}[value]
							}
						</button>
					))}
				</fieldset>
				{preset === "custom" && (
					<div className={styles.custom}>
						<label>
							From{" "}
							<input
								type="date"
								value={startDate}
								onChange={(event) => {
									setStartDate(event.target.value);
									setAppliedCustom(null);
									setExportError("");
								}}
							/>
						</label>
						<label>
							Through{" "}
							<input
								type="date"
								value={endDate}
								onChange={(event) => {
									setEndDate(event.target.value);
									setAppliedCustom(null);
									setExportError("");
								}}
							/>
						</label>
						<button
							disabled={!customValid}
							onClick={() => setAppliedCustom({ start: startDate, end: endDate })}
						>
							Apply dates
						</button>
					</div>
				)}
				<p>Dates use each branch’s local calendar. Custom dates include both endpoints.</p>
				{preset === "custom" && !customValid && (
					<p role="status">Choose a start and end date within 366 days.</p>
				)}
				{role === "admin" && (
					<>
						<label className={styles.redactToggle}>
							<input
								type="checkbox"
								checked={redacted}
								onChange={(event) => {
									setRedacted(event.target.checked);
									setExportError("");
								}}
							/>
							Redact visitor and host details
						</label>
						<button
							disabled={!valid || query.isPending || exportBusy || !query.data}
							onClick={() => void exportCsv()}
						>
							{exportBusy ? "Preparing export…" : "Export CSV"}
						</button>
						{exportBusy && (
							<p role="status">
								Preparing the audited CSV. Keep this page open until the download begins.
							</p>
						)}
						<p>Full exports contain personal information. Each request is audited.</p>
					</>
				)}
				{exportError && <p role="alert">{exportError}</p>}
			</div>
			{!valid ? (
				<p>Apply a valid start and end date to load a report.</p>
			) : query.isPending ? (
				<p>Loading report…</p>
			) : query.error ? (
				<p role="alert">
					{query.error instanceof RequestError && query.error.kind === "forbidden"
						? "Report access is unavailable. Your organization or branch assignment may be inactive."
						: query.error instanceof RequestError && query.error.kind === "timeout"
							? query.error.message
							: query.error instanceof RequestError && query.error.kind === "unavailable"
								? "Report service is temporarily unavailable."
								: "Unable to load report."}{" "}
					<button onClick={() => void query.refetch()}>Retry</button>
				</p>
			) : (
				query.data && (
					<>
						<p className={styles.reportMeta}>
							Scope:{" "}
							{locationId
								? (branches.find((branch) => branch.id === locationId)?.name ?? "Selected branch")
								: "All branches"}{" "}
							· As of {new Date(query.data.generated_at).toLocaleString()} ·{" "}
							<button onClick={() => void query.refetch()} disabled={query.isFetching}>
								{query.isFetching ? "Refreshing…" : "Refresh report"}
							</button>
						</p>
						<p>
							All-branch totals use each branch’s local calendar day. Arrival hours are local to each
							branch.
						</p>
						<details>
							<summary>Branch date ranges and time zones</summary>
							<ul>
								{Object.entries(query.data.branch_ranges).map(([id, range]) => (
									<li key={id}>
										{branches.find((branch) => branch.id === id)?.name ?? "Previous branch"} (
										{branches.find((branch) => branch.id === id)?.timezone ?? "Local time"}):{" "}
										{displayDay(range.start)} through {displayDay(range.end)}
									</li>
								))}
							</ul>
						</details>
						{query.data.total === 0 && (
							<p role="status">
								No visits match these filters.{" "}
								<button
									onClick={() => {
										setPreset("7d");
										if (role === "admin") setLocationId("");
										setExportError("");
									}}
								>
									{role === "admin" ? "Reset to all branches and 7 days" : "Reset to 7 days"}
								</button>
							</p>
						)}
						<div className={styles.cards}>
							<section>
								<span>Visits</span>
								<strong>{query.data.total}</strong>
							</section>
							<section>
								<span>Average duration</span>
								<strong>
									{query.data.average_duration_minutes == null
										? "—"
										: `${query.data.average_duration_minutes} min`}
								</strong>
							</section>
						</div>
						<div className={styles.charts}>
							<section>
								<h2>Visits by day</h2>
								<p>
									{query.data.series.length} day(s) with visits; {query.data.total} visits in this
									report.
								</p>
								<ResponsiveContainer width="100%" height={260}>
									<LineChart data={query.data.series} accessibilityLayer>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="date" tickFormatter={displayDay} />
										<YAxis allowDecimals={false} />
										<Tooltip labelFormatter={(value) => displayDay(String(value))} />
										<Line dataKey="count" stroke="#1e3858" strokeWidth={3} />
									</LineChart>
								</ResponsiveContainer>
								<details>
									<summary>View daily values as a table</summary>
									<table>
										<thead>
											<tr>
												<th scope="col">Branch-local date</th>
												<th scope="col">Visits</th>
											</tr>
										</thead>
										<tbody>
											{query.data.series.map((point) => (
												<tr key={point.date}>
													<th scope="row">{displayDay(point.date)}</th>
													<td>{point.count}</td>
												</tr>
											))}
										</tbody>
									</table>
								</details>
							</section>
							<section>
								<h2>Arrival hour (branch local)</h2>
								<p>{hours.length} hour(s) with visits.</p>
								<ResponsiveContainer width="100%" height={260}>
									<BarChart data={hours} accessibilityLayer>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="hour" />
										<YAxis allowDecimals={false} />
										<Tooltip />
										<Bar dataKey="count" fill="#c53640" />
									</BarChart>
								</ResponsiveContainer>
								<details>
									<summary>View hourly values as a table</summary>
									<table>
										<thead>
											<tr>
												<th scope="col">Branch-local hour</th>
												<th scope="col">Visits</th>
											</tr>
										</thead>
										<tbody>
											{hours.map((point) => (
												<tr key={point.hour}>
													<th scope="row">{point.hour}</th>
													<td>{point.count}</td>
												</tr>
											))}
										</tbody>
									</table>
								</details>
							</section>
						</div>
						<div className={styles.tables}>
							<Breakdown title="Status" data={query.data.statuses} kind="status" />
							<Breakdown title="Visit type" data={query.data.visit_types} kind="type" />
							<Breakdown title="Check-in method" data={query.data.check_in_methods} kind="method" />
							{role === "admin" && (
								<Breakdown
									title="Branch"
									data={query.data.branches}
									label={(id) =>
										branches.find((branch) => branch.id === id)?.name ?? "Previous branch"
									}
								/>
							)}
						</div>
					</>
				)
			)}
		</main>
	);
}

function Breakdown({
	title,
	data,
	kind,
	label,
}: {
	title: string;
	data: Record<string, number>;
	kind?: "status" | "type" | "method";
	label?: (value: string) => string;
}) {
	return (
		<section>
			<h2>{title}</h2>
			<table>
				<thead>
					<tr>
						<th scope="col">{title}</th>
						<th scope="col">Visits</th>
					</tr>
				</thead>
				<tbody>
					{Object.entries(data)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([name, count]) => (
							<tr key={name}>
								<th scope="row">{label ? label(name) : kind ? reportLabel(kind, name) : name}</th>
								<td>{count}</td>
							</tr>
						))}
				</tbody>
			</table>
		</section>
	);
}
