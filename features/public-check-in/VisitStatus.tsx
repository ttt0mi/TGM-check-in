"use client";

import { useEffect, useState } from "react";
import { getVisitorVisit } from "./api";
import { terminalStatuses } from "./session";
import type { VisitorVisit } from "./types";
import styles from "./public-check-in.module.css";

const labels: Record<string, string> = {
	pending_reception_review: "Reception is reviewing your visit",
	pending_host_acknowledgement: "Waiting for your host",
	host_approved_awaiting_reception: "Your host approved. Reception will admit you shortly",
	approved_on_site: "You are checked in",
	checked_out: "You have checked out",
	declined: "This visit was declined",
	cancelled: "This visit was cancelled",
	auto_closed: "This visit has closed",
};

export function VisitStatus({
	token,
	onUnavailable,
	onVisitChange,
}: {
	token: string;
	onUnavailable?: () => void;
	onVisitChange: (visit: VisitorVisit) => void;
}) {
	const [visit, setVisit] = useState<VisitorVisit | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		async function refresh() {
			try {
				const latest = await getVisitorVisit(token);
				if (!active) return;
				setVisit(latest);
				onVisitChange(latest);
				setError("");
				if (!terminalStatuses.has(latest.status)) timer = setTimeout(refresh, 15000);
			} catch (cause) {
				if (!active) return;
				const message = cause instanceof Error ? cause.message : "Unable to read this visit";
				setError(message);
				if (message === "Visit unavailable") onUnavailable?.();
				else timer = setTimeout(refresh, 30000);
			}
		}
		function onVisible() {
			if (document.visibilityState === "visible") {
				if (timer) clearTimeout(timer);
				void refresh();
			}
		}
		void refresh();
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			active = false;
			if (timer) clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [token, onUnavailable, onVisitChange]);

	return (
		<section className={styles.status} aria-live="polite">
			<h2>Your visit</h2>
			{visit ? (
				<>
					<strong>{labels[visit.status] ?? visit.status}</strong>
					<p>
						{visit.visitor_display_name} · {visit.branch_name}
					</p>
					{visit.host_name && <p>Host: {visit.host_name}</p>}
					{terminalStatuses.has(visit.status) && (
						<p>This visit is complete. Ask reception if you need another check-in.</p>
					)}
				</>
			) : (
				<p>Loading your visit…</p>
			)}
			{error && <p role="alert">{error}</p>}
		</section>
	);
}
