"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/browser";
import styles from "./analytics.module.css";

type Branch = { id: string; name: string; timezone: string };
type Report = {
	total: number;
	statuses: Record<string, number>;
	visit_types: Record<string, number>;
	check_in_methods: Record<string, number>;
	branches: Record<string, number>;
	series: { date: string; count: number }[];
	hours: Record<string, number>;
	average_duration_minutes: number | null;
	branch_ranges: Record<string, { start: string; end: string }>;
};
type Preset = "today" | "7d" | "30d" | "mtd" | "custom";

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
	const [exportError, setExportError] = useState("");
	const body =
		preset === "custom"
			? {
					preset,
					start_date: startDate,
					end_date: endDate,
					...(locationId ? { location_id: locationId } : {}),
				}
			: { preset, ...(locationId ? { location_id: locationId } : {}) };
	const valid = preset !== "custom" || Boolean(startDate && endDate && endDate >= startDate);
	const query = useQuery({
		queryKey: ["analytics", body],
		enabled: valid,
		queryFn: async () => {
			const { data, error } = await createClient().functions.invoke("get-visit-analytics", { body });
			if (error) throw error;
			return data as Report;
		},
	});

	async function exportCsv() {
		setExportError("");
		const { data, error } = await createClient().functions.invoke("export-visit-report", { body });
		if (error) {
			setExportError(error.message);
			return;
		}
		const blob = new Blob([data as string], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `tgm-visits-${preset}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	const hours = Object.entries(query.data?.hours ?? {})
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([hour, count]) => ({ hour, count }));
	return (
		<main id="main-content" className={styles.page}>
			<Link href="/app">← Visits</Link>
			<h1>Visit analytics</h1>
			<div className={styles.filters}>
				{role === "admin" && (
					<label>
						Branch{" "}
						<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
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
							onClick={() => setPreset(value)}
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
								onChange={(event) => setStartDate(event.target.value)}
							/>
						</label>
						<label>
							Through{" "}
							<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
						</label>
					</div>
				)}
				<p>Dates use each branch’s local calendar. Custom dates include both endpoints.</p>
				{role === "admin" && (
					<button disabled={!valid || query.isPending} onClick={() => void exportCsv()}>
						Export CSV
					</button>
				)}
				{exportError && <p role="alert">{exportError}</p>}
			</div>
			{!valid ? (
				<p>Choose a valid start and end date.</p>
			) : query.isPending ? (
				<p>Loading report…</p>
			) : query.error ? (
				<p role="alert">
					Unable to load report. <button onClick={() => void query.refetch()}>Retry</button>
				</p>
			) : (
				query.data && (
					<>
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
								<ResponsiveContainer width="100%" height={260}>
									<LineChart data={query.data.series}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="date" />
										<YAxis allowDecimals={false} />
										<Tooltip />
										<Line dataKey="count" stroke="#1e3858" strokeWidth={3} />
									</LineChart>
								</ResponsiveContainer>
							</section>
							<section>
								<h2>Arrival hour</h2>
								<ResponsiveContainer width="100%" height={260}>
									<BarChart data={hours}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="hour" />
										<YAxis allowDecimals={false} />
										<Tooltip />
										<Bar dataKey="count" fill="#c53640" />
									</BarChart>
								</ResponsiveContainer>
							</section>
						</div>
						<div className={styles.tables}>
							<Breakdown title="Status" data={query.data.statuses} />
							<Breakdown title="Visit type" data={query.data.visit_types} />
							<Breakdown title="Check-in method" data={query.data.check_in_methods} />
							{role === "admin" && <Breakdown title="Branch" data={query.data.branches} />}
						</div>
					</>
				)
			)}
		</main>
	);
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
	return (
		<section>
			<h2>{title}</h2>
			<table>
				<tbody>
					{Object.entries(data)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([name, count]) => (
							<tr key={name}>
								<th scope="row">{name.replaceAll("_", " ")}</th>
								<td>{count}</td>
							</tr>
						))}
				</tbody>
			</table>
		</section>
	);
}
