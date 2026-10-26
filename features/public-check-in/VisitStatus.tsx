"use client";

import { useEffect, useState } from "react";
import { getVisitorVisit } from "./api";
import { terminalStatuses } from "./session";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
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
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const [retryCounter, setRetryCounter] = useState(0);
	const online = useOnlineStatus();

	useEffect(() => {
		let active = true;
		let inFlight = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		async function refresh() {
			if (inFlight || !navigator.onLine) return;
			inFlight = true;
			try {
				const latest = await getVisitorVisit(token);
				if (!active) return;
				setVisit(latest);
				setLastUpdated(new Date());
				onVisitChange(latest);
				setError("");
				if (!terminalStatuses.has(latest.status)) timer = setTimeout(refresh, 15000);
			} catch (cause) {
				if (!active) return;
				const message = cause instanceof Error ? cause.message : "Unable to read this visit";
				setError(message);
				if (message === "Visit unavailable") onUnavailable?.();
				else timer = setTimeout(refresh, 30000);
			} finally {
				inFlight = false;
			}
		}
		function onVisible() {
			if (document.visibilityState === "visible") {
				if (timer) clearTimeout(timer);
				void refresh();
			}
		}
		void refresh();
		window.addEventListener("online", onVisible);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			active = false;
			if (timer) clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("online", onVisible);
		};
	}, [token, onUnavailable, onVisitChange, retryCounter]);

	return (
		<section className={styles.status} aria-live="polite">
			<h2>Your visit</h2>
			{visit ? (
				<>
					<strong>{labels[visit.status] ?? "Your visit was updated"}</strong>
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
			{!online && <p role="status">You are offline. Status updates will resume when your connection returns.</p>}
			{lastUpdated && (
				<p>
					Last updated {lastUpdated.toLocaleTimeString()}.{" "}
					{visit && !terminalStatuses.has(visit.status)
						? "Automatic updates every 15 seconds."
						: "This visit is complete; refresh manually for any correction."}
				</p>
			)}
			{error && <p>We will retry in 30 seconds.</p>}
			<button type="button" onClick={() => setRetryCounter((value) => value + 1)}>
				Refresh status
			</button>
		</section>
	);
}
