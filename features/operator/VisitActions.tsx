"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { functionError, postgrestError, RequestError } from "@/lib/http/request-error";
import type { Visit } from "./types";
import styles from "./operator.module.css";
import { scheduleVisitRefresh } from "./refresh-queue";
import { branchLocalToIso, formatBranchLocal } from "./branch-time";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";

export function VisitActions({
	visit,
	role,
	timezone,
	showDelivery,
}: {
	visit: Visit;
	role: "admin" | "receptionist";
	timezone: string;
	showDelivery: boolean;
}) {
	const [busy, setBusy] = useState(false);
	const online = useOnlineStatus();
	const [message, setMessage] = useState("");
	const [failed, setFailed] = useState(false);
	const [correctionTime, setCorrectionTime] = useState("");
	const [correctionReason, setCorrectionReason] = useState("");
	const [correctionError, setCorrectionError] = useState("");
	const [reviewing, setReviewing] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const dialog = useRef<HTMLDialogElement | null>(null);
	const opener = useRef<HTMLButtonElement | null>(null);
	const queryClient = useQueryClient();
	const delivery = useQuery({
		queryKey: ["host-delivery", visit.id],
		enabled: visit.status === "pending_host_acknowledgement" && showDelivery,
		queryFn: async () => {
			const { data, error } = await createClient()
				.from("host_notification_attempts")
				.select("status,attempted_at")
				.eq("visit_id", visit.id)
				.order("attempted_at", { ascending: false })
				.limit(1)
				.maybeSingle();
			if (error) throw postgrestError(error);
			return data;
		},
	});
	const actions: { label: string; action: string }[] = [];
	if (visit.status === "pending_reception_review") {
		actions.push({
			label: visit.staff_id ? "Review and notify host" : "Admit visitor",
			action: visit.staff_id ? "review" : "admit",
		});
		actions.push({ label: "Cancel", action: "cancel" });
	} else if (visit.status === "pending_host_acknowledgement") {
		if (showDelivery && !delivery.isPending && !delivery.error && (!delivery.data || delivery.data.status === "failed"))
			actions.push({ label: delivery.data ? "Retry failed host email" : "Send host email", action: "notify" });
		actions.push({ label: "Cancel", action: "cancel" });
	} else if (visit.status === "host_approved_awaiting_reception") {
		actions.push({ label: "Admit visitor", action: "admit" }, { label: "Cancel", action: "cancel" });
	} else if (visit.status === "approved_on_site") {
		actions.push({ label: "Check out", action: "checkout" });
	}
	if (role === "admin" && ["approved_on_site", "checked_out", "auto_closed"].includes(visit.status)) {
		actions.push({ label: "Correct checkout", action: "correct_checkout" });
	}

	function openCorrection(button: HTMLButtonElement) {
		opener.current = button;
		setCorrectionTime(formatBranchLocal(visit.time_out ?? new Date().toISOString(), timezone));
		setCorrectionReason("");
		setCorrectionError("");
		setReviewing(false);
		setDialogOpen(true);
		dialog.current?.showModal();
	}

	async function perform(action: string, patch?: Record<string, unknown>): Promise<boolean> {
		if (!online) {
			setMessage("You appear to be offline. Reconnect and retry this action.");
			setFailed(true);
			return false;
		}
		if (
			action === "cancel" &&
			!window.confirm(
				`Cancel the visit for ${visit.visitor_preferred_name || visit.visitor_full_name}? The visitor cannot continue this visit.`,
			)
		)
			return false;
		setBusy(true);
		setMessage("");
		setFailed(false);
		try {
			const supabase = createClient();
			const endpoint = action === "notify" ? "send-host-email" : "reception-visit-action";
			const timeout = AbortSignal.timeout(action === "notify" ? 30000 : 20000);
			const { error, response } = await supabase.functions.invoke(endpoint, {
				body:
					action === "notify"
						? { visit_id: visit.id }
						: { visit_id: visit.id, action, ...(patch ? { patch } : {}) },
				signal: timeout,
			});
			if (timeout.aborted) throw new RequestError("unavailable", null, "Request timed out.");
			if (error) throw await functionError(error, response);
			if (action === "review") {
				const emailTimeout = AbortSignal.timeout(30000);
				const sent = await supabase.functions.invoke("send-host-email", {
					body: { visit_id: visit.id },
					signal: emailTimeout,
				});
				if (emailTimeout.aborted || sent.error) {
					setMessage("Review saved. Host email outcome is unclear; check delivery history before retrying.");
					setFailed(true);
				} else setMessage("Host notified.");
			} else setMessage("Visit updated.");
			if (action === "review" || action === "notify")
				await queryClient.invalidateQueries({ queryKey: ["host-delivery", visit.id] });
			scheduleVisitRefresh(queryClient, visit.location_id);
			await queryClient.invalidateQueries({ queryKey: ["visit-events", visit.id] });
			return true;
		} catch (cause) {
			if (action === "notify" || action === "review")
				await queryClient.invalidateQueries({ queryKey: ["host-delivery", visit.id] });
			setMessage(
				action === "notify"
					? "Email outcome is unclear. Check delivery history before retrying."
					: cause instanceof RequestError && cause.status !== null
						? `${cause.message}${cause.correlationId ? ` Reference: ${cause.correlationId}.` : ""}`
						: "Action could not be confirmed. Refresh the queue before retrying.",
			);
			setFailed(true);
			return false;
		} finally {
			setBusy(false);
		}
	}

	function reviewCorrection(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const iso = branchLocalToIso(correctionTime, timezone);
		if (!iso) {
			setCorrectionError("Enter a valid, unambiguous branch-local date and time.");
			return;
		}
		if (
			new Date(iso).getTime() > Date.now() ||
			new Date(iso).getTime() < new Date(visit.admitted_at ?? visit.arrived_at).getTime()
		) {
			setCorrectionError("Checkout must be after arrival or admission and cannot be in the future.");
			return;
		}
		if (!correctionReason.trim() || correctionReason.trim().length > 500) {
			setCorrectionError("Enter a reason of up to 500 characters.");
			return;
		}
		setCorrectionError("");
		setReviewing(true);
		requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>("button")?.focus());
	}

	async function confirmCorrection() {
		const iso = branchLocalToIso(correctionTime, timezone);
		if (!iso) {
			setReviewing(false);
			return;
		}
		if (await perform("correct_checkout", { reason: correctionReason.trim(), time_out: iso }))
			dialog.current?.close();
	}

	return (
		<div className={styles.actions}>
			{visit.status === "pending_host_acknowledgement" && showDelivery && (
				<div role="status">
					{delivery.isPending ? "Checking host email delivery…" : delivery.error ? (
						<>Host email status is unavailable. <button onClick={() => void delivery.refetch()}>Retry status</button></>
					) : delivery.data ? (
						<>
							Host email: {delivery.data.status === "sending" ? "sending or awaiting confirmation" : delivery.data.status}.
							{" "}Last attempt: {new Intl.DateTimeFormat("en-NG", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.data.attempted_at))} ({timezone}).
							{delivery.data.status === "unknown" && (
								role === "admin" ? <> The provider may have accepted the email. Review the <Link href="/app/manage/host-email-recovery">host email recovery procedure</Link> before taking action.</> : " Ask an administrator to review the provider outcome; do not resend blindly."
							)}
							{delivery.data.status === "sending" && " Refresh status before considering a retry."}
						</>
					) : "Host email has not been sent yet."}
				</div>
			)}
			{actions.map(({ label, action }) => (
				<button
					key={action}
					disabled={busy || !online}
					onClick={(event) =>
						action === "correct_checkout" ? openCorrection(event.currentTarget) : void perform(action)
					}
				>
					{label}
				</button>
			))}
			{message && !dialogOpen && <span role={failed ? "alert" : "status"}>{message}</span>}
			<dialog
				ref={dialog}
				className={styles.correctionDialog}
				aria-labelledby="correction-heading"
				onClose={() => {
					setDialogOpen(false);
					opener.current?.focus();
				}}
			>
				<h2 id="correction-heading">Correct checkout</h2>
				<p>
					Visitor: <strong>{visit.visitor_preferred_name || visit.visitor_full_name}</strong>
				</p>
				<p>Branch time zone: {timezone}</p>
				<p>
					Recorded checkout:{" "}
					{visit.time_out
						? new Intl.DateTimeFormat("en-NG", {
								timeZone: timezone,
								dateStyle: "medium",
								timeStyle: "short",
							}).format(new Date(visit.time_out))
						: "Not yet checked out"}
				</p>
				{reviewing ? (
					<div>
						<p>
							New checkout:{" "}
							<strong>
								{correctionTime.replace("T", " ")} ({timezone})
							</strong>
						</p>
						<p>Reason: {correctionReason.trim()}</p>
						<p>This changes the recorded checkout and creates an audit event.</p>
						<button disabled={busy || !online} onClick={() => void confirmCorrection()}>
							{busy ? "Saving…" : "Confirm correction"}
						</button>
						<button disabled={busy} onClick={() => setReviewing(false)}>
							Edit
						</button>
					</div>
				) : (
					<form onSubmit={reviewCorrection}>
						<label>
							Corrected date and time ({timezone}){" "}
							<input
								type="datetime-local"
								required
								value={correctionTime}
								onChange={(event) => setCorrectionTime(event.target.value)}
							/>
						</label>
						<label>
							Reason for correction{" "}
							<textarea
								required
								maxLength={500}
								value={correctionReason}
								onChange={(event) => setCorrectionReason(event.target.value)}
							/>
						</label>
						<button type="submit">Review correction</button>
					</form>
				)}
				{correctionError && <p role="alert">{correctionError}</p>}
				{failed && message && <p role="alert">{message}</p>}
				<button disabled={busy} onClick={() => dialog.current?.close()}>
					Cancel
				</button>
			</dialog>
		</div>
	);
}
