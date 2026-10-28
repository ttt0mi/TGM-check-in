"use client";

import { useEffect, useState } from "react";
import { VisitActions } from "./VisitActions";
import { VisitDetails } from "./VisitDetails";
import type { Branch, Department, Staff, Visit } from "./types";
import { ACTIVE_STATUSES, type ActiveStatus, useVisits } from "./useVisits";
import styles from "./operator.module.css";
import { visitTypeLabel } from "@/features/shared/visit-labels";

const LABELS: Record<ActiveStatus | "history", string> = {
	pending_reception_review: "Needs reception review",
	pending_host_acknowledgement: "Waiting for host",
	host_approved_awaiting_reception: "Ready for admission",
	approved_on_site: "Currently on site",
	history: "Completed history",
};

type Queue = ReturnType<typeof useVisits>;

function elapsedMinutes(since: string, now: number) {
	return Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
}

function overdueMinutes(visit: Visit, branch: Branch) {
	switch (visit.status) {
		case "pending_reception_review":
			return branch.reception_overdue_minutes;
		case "pending_host_acknowledgement":
			return branch.host_overdue_minutes;
		case "host_approved_awaiting_reception":
			return branch.admission_overdue_minutes;
		default:
			return null;
	}
}

export function VisitQueue({
	queue,
	branch,
	role,
	departments,
	staff,
	onSearchChange,
}: {
	queue: Queue;
	branch: Branch;
	role: "admin" | "receptionist";
	departments: Department[];
	staff: Staff[];
	onSearchChange: (search: string) => void;
}) {
	const [searchInput, setSearchInput] = useState("");
	const [showHistory, setShowHistory] = useState(false);
	const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
	const [now, setNow] = useState(0);
	useEffect(() => {
		const timer = window.setTimeout(() => onSearchChange(searchInput.trim().slice(0, 80)), 300);
		return () => clearTimeout(timer);
	}, [searchInput, onSearchChange]);
	useEffect(() => {
		const initial = window.setTimeout(() => setNow(Date.now()), 0);
		const timer = window.setInterval(() => setNow(Date.now()), 60000);
		return () => {
			clearTimeout(initial);
			clearInterval(timer);
		};
	}, []);

	const updatedAt = Math.max(
		queue.counts.dataUpdatedAt,
		...Object.values(queue.groups).map((group) => group.dataUpdatedAt),
	);
	const renderVisit = (visit: Visit) => {
		const minutes = now ? elapsedMinutes(visit.arrived_at, now) : 0;
		const threshold = overdueMinutes(visit, branch);
		return (
			<article key={visit.id} className={styles.visit}>
				<div>
					<strong>{visit.visitor_preferred_name || visit.visitor_full_name}</strong>
					<span>{LABELS[visit.status as ActiveStatus] ?? "Completed"}</span>
				</div>
				<p>
					{visitTypeLabel(visit.visit_type)} ·{" "}
					{new Intl.DateTimeFormat(undefined, {
						timeZone: branch.timezone,
						dateStyle: "medium",
						timeStyle: "short",
					}).format(new Date(visit.arrived_at))}
				</p>
				<p>{visit.purpose}</p>
				{visit.status !== "checked_out" &&
					visit.status !== "declined" &&
					visit.status !== "cancelled" &&
					visit.status !== "auto_closed" && (
						<p className={threshold !== null && minutes >= threshold ? styles.overdue : undefined}>
							Waiting {minutes} min{threshold !== null && minutes >= threshold ? " · Overdue" : ""}
						</p>
					)}
				<VisitActions
					visit={visit}
					role={role}
					timezone={branch.timezone}
					showDelivery={expandedVisitId === visit.id}
				/>
				<button
					className={styles.detailsButton}
					aria-expanded={expandedVisitId === visit.id}
					onClick={() => setExpandedVisitId(expandedVisitId === visit.id ? null : visit.id)}
				>
					{expandedVisitId === visit.id
						? "Hide details"
						: visit.status === "pending_host_acknowledgement"
							? "Review host email, details and history"
							: "Details and history"}
				</button>
				{expandedVisitId === visit.id && (
					<VisitDetails
						visit={visit}
						departments={departments}
						staff={staff.filter((item) => item.location_id === visit.location_id)}
						timezone={branch.timezone}
					/>
				)}
			</article>
		);
	};
	const renderGroup = (status: ActiveStatus | "history") => {
		const group = queue.groups[status];
		const items = group.data?.pages.flatMap((page) => page.items) ?? [];
		return (
			<section key={status} className={styles.queueGroup} aria-labelledby={`queue-${status}`}>
				<h2 id={`queue-${status}`}>
					{LABELS[status]} <span>({queue.counts.data?.[status] ?? "…"})</span>
				</h2>
				{group.isPending ? (
					<p>Loading visits…</p>
				) : group.error ? (
					<p role="alert">
						Unable to load this group. <button onClick={() => void group.refetch()}>Retry</button>
					</p>
				) : items.length ? (
					<>
						<div className={styles.visitList}>{items.map(renderVisit)}</div>
						{group.hasNextPage && (
							<button
								className={styles.loadMore}
								disabled={group.isFetchingNextPage}
								onClick={() => void group.fetchNextPage()}
							>
								{group.isFetchingNextPage ? "Loading…" : "Load more visits"}
							</button>
						)}
					</>
				) : (
					<p>
						No {status === "history" ? "completed" : "active"} visits in this group
						{searchInput ? " match your search" : ""}.
					</p>
				)}
			</section>
		);
	};

	return (
		<div>
			<div className={styles.queueToolbar}>
				<label>
					Search name or phone{" "}
					<input
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
						maxLength={80}
					/>
				</label>
				<button onClick={() => void queue.refresh()}>Refresh queue</button>
			</div>
			<p className={styles.connection} role="status">
				{queue.connection === "connected"
					? "Live updates connected"
					: queue.connection === "connecting"
						? "Connecting to live updates; queue refreshes automatically"
						: "Live updates unavailable; queue refreshes every 30 seconds"}
				{updatedAt > 0 &&
					` · Updated ${new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(updatedAt)}`}
			</p>
			{queue.counts.error && (
				<p role="alert">
					Counts are unavailable. <button onClick={() => void queue.counts.refetch()}>Retry counts</button>
				</p>
			)}
			{ACTIVE_STATUSES.map(renderGroup)}
			<section className={styles.historySection}>
				<button aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
					{showHistory ? "Hide" : "Show"} completed history ({queue.counts.data?.history ?? "…"})
				</button>
				{showHistory && renderGroup("history")}
			</section>
		</div>
	);
}
