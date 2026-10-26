"use client";

import { useEffect, useRef, useState } from "react";
import { RequestError } from "@/lib/http/request-error";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { getHostPreview, respondToHostVisit, type HostPreview } from "./api";
import styles from "@/features/public-check-in/public-check-in.module.css";

const storageKey = "tgm:host-decision-token";
const tokenPattern = /^[a-f0-9]{64}$/i;

function clearStoredToken() {
	try {
		sessionStorage.removeItem(storageKey);
	} catch {
		/* In-memory token remains usable. */
	}
}

function localDate(value: string, timezone: string) {
	return new Intl.DateTimeFormat("en-NG", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(
		new Date(value),
	);
}

export function HostDecision() {
	const [token, setToken] = useState("");
	const [preview, setPreview] = useState<HostPreview | null>(null);
	const [phase, setPhase] = useState<"loading" | "active" | "invalid" | "expired" | "used" | "network" | "success">(
		"loading",
	);
	const [storageLimited, setStorageLimited] = useState(false);
	const [confirmation, setConfirmation] = useState<"approved" | "declined" | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [retryCounter, setRetryCounter] = useState(0);
	const online = useOnlineStatus();
	const decisionOpener = useRef<"approved" | "declined" | null>(null);
	const approveButton = useRef<HTMLButtonElement | null>(null);
	const declineButton = useRef<HTMLButtonElement | null>(null);
	const review = useRef<HTMLDivElement | null>(null);
	const heading = useRef<HTMLHeadingElement | null>(null);

	useEffect(() => {
		if (confirmation) review.current?.focus();
	}, [confirmation]);

	function cancelConfirmation() {
		setConfirmation(null);
		requestAnimationFrame(() =>
			(decisionOpener.current === "approved" ? approveButton : declineButton).current?.focus(),
		);
	}

	useEffect(() => {
		let active = true;
		let limited = false;
		const fragment = new URLSearchParams(window.location.hash.slice(1));
		const fromLink = fragment.get("token");
		let value = fromLink ?? "";
		if (!fromLink) {
			try {
				value = sessionStorage.getItem(storageKey) ?? "";
			} catch {
				limited = true;
			}
		}
		if (!tokenPattern.test(value)) {
			clearStoredToken();
		} else {
			if (fromLink) {
				try {
					sessionStorage.setItem(storageKey, value);
				} catch {
					limited = true;
				}
			}
		}
		window.history.replaceState(null, "", window.location.pathname);
		queueMicrotask(() => {
			if (!active) return;
			setStorageLimited(limited);
			if (tokenPattern.test(value)) setToken(value);
			else setPhase("invalid");
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (!token) return;
		let active = true;
		queueMicrotask(() => {
			if (active) setPhase("loading");
		});
		void getHostPreview(token)
			.then((result) => {
				if (!active) return;
				setPreview(result);
				setPhase(result.state);
				if (result.state !== "active") {
					clearStoredToken();
					setToken("");
				}
			})
			.catch(() => {
				if (active) setPhase("network");
			});
		return () => {
			active = false;
		};
	}, [token, retryCounter]);

	async function decide(outcome: "approved" | "declined") {
		if (!token || busy || preview?.state !== "active") return;
		setBusy(true);
		setMessage("");
		try {
			const result = await respondToHostVisit(token, outcome);
			setMessage(
				result.requires_reception_admission
					? "Approved. Reception will admit the visitor."
					: "The visit was declined.",
			);
			setPhase("success");
			requestAnimationFrame(() => heading.current?.focus());
			setToken("");
			clearStoredToken();
		} catch (cause) {
			if (cause instanceof RequestError && (cause.status === 410 || cause.kind === "timeout")) {
				setConfirmation(null);
				if (cause.kind === "timeout")
					setMessage("Decision outcome is uncertain. Checking the link status before another attempt.");
				setRetryCounter((value) => value + 1);
			} else {
				setMessage(cause instanceof Error ? cause.message : "Unable to record your decision. Please retry.");
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<main id="main-content" className={styles.page}>
			<div className={styles.card} aria-busy={busy}>
				<div className={styles.brand}>
					TGM <span>Host decision</span>
				</div>
				<h1 ref={heading} tabIndex={-1}>
					Visitor request
				</h1>
				{!online && (
					<p role="status">You appear to be offline. This request remains open; reconnect before deciding.</p>
				)}
				{storageLimited && token && (
					<p role="status">
						This browser cannot save this link for a refresh. Keep this tab open until you decide.
					</p>
				)}
				{phase === "loading" && <p role="status">Loading this visitor request…</p>}
				{phase === "network" && (
					<p role="alert">
						We could not load this request. Check your connection.{" "}
						<button onClick={() => setRetryCounter((value) => value + 1)}>Retry preview</button>
					</p>
				)}
				{phase === "invalid" && (
					<p role="status">This decision link is invalid. Ask reception to send a current link.</p>
				)}
				{phase === "expired" && <p role="status">This decision link has expired. Ask reception for help.</p>}
				{phase === "used" && (
					<p role="status">
						This decision link has already been used or the visit is no longer awaiting a host decision.
					</p>
				)}
				{phase === "success" && <p role="status">{message} You can close this page.</p>}
				{phase === "active" && preview?.state === "active" && (
					<>
						<dl>
							<dt>Visitor</dt>
							<dd>{preview.visitor_name}</dd>
							{preview.visitor_organization && (
								<>
									<dt>Organization</dt>
									<dd>{preview.visitor_organization}</dd>
								</>
							)}
							<dt>Visit type</dt>
							<dd>{preview.visit_type.replaceAll("_", " ")}</dd>
							<dt>Purpose</dt>
							<dd>{preview.purpose}</dd>
							<dt>Branch</dt>
							<dd>{preview.branch_name}</dd>
							<dt>Arrived</dt>
							<dd>{localDate(preview.arrived_at, preview.branch_timezone)}</dd>
							<dt>Link expires</dt>
							<dd>{localDate(preview.expires_at, preview.branch_timezone)}</dd>
						</dl>
						<p>Reception completes admission after approval.</p>
						{confirmation ? (
							<div ref={review} tabIndex={-1} role="group" aria-label="Confirm host decision">
								<p>
									{confirmation === "declined"
										? "Declining ends this visit request. The visitor cannot use this link again."
										: "Approve this visitor request? Reception will still complete admission."}
								</p>
								<button disabled={busy || !online} onClick={() => void decide(confirmation)}>
									{busy
										? "Recording…"
										: confirmation === "approved"
											? "Confirm approval"
											: "Confirm decline"}
								</button>
								<button disabled={busy} onClick={cancelConfirmation}>
									Cancel
								</button>
							</div>
						) : (
							<div className={styles.actions}>
								<button
									ref={approveButton}
									disabled={busy}
									onClick={() => {
										decisionOpener.current = "approved";
										setConfirmation("approved");
									}}
								>
									Approve visit
								</button>
								<button
									ref={declineButton}
									disabled={busy}
									onClick={() => {
										decisionOpener.current = "declined";
										setConfirmation("declined");
									}}
								>
									Decline visit
								</button>
							</div>
						)}
						{message && <p role="alert">{message}</p>}
					</>
				)}
			</div>
		</main>
	);
}
