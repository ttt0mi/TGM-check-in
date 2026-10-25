"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/browser";
import type { Visit } from "./types";
import styles from "./operator.module.css";

export function VisitActions({ visit, role }: { visit: Visit; role: "admin" | "receptionist" }) {
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const queryClient = useQueryClient();
	const actions: { label: string; action: string }[] = [];
	if (visit.status === "pending_reception_review") {
		actions.push({
			label: visit.staff_id ? "Review and notify host" : "Admit visitor",
			action: visit.staff_id ? "review" : "admit",
		});
		actions.push({ label: "Cancel", action: "cancel" });
	} else if (visit.status === "pending_host_acknowledgement") {
		actions.push({ label: "Retry host email", action: "notify" }, { label: "Cancel", action: "cancel" });
	} else if (visit.status === "host_approved_awaiting_reception") {
		actions.push({ label: "Admit visitor", action: "admit" }, { label: "Cancel", action: "cancel" });
	} else if (visit.status === "approved_on_site") {
		actions.push({ label: "Check out", action: "checkout" });
	}
	if (role === "admin" && ["approved_on_site", "checked_out", "auto_closed"].includes(visit.status)) {
		actions.push({ label: "Correct checkout", action: "correct_checkout" });
	}

	async function perform(action: string) {
		let patch: Record<string, unknown> | undefined;
		if (action === "correct_checkout") {
			const reason = window.prompt("Reason for correction (required)")?.trim();
			if (!reason) return;
			const enteredTime = window.prompt(
				"Checkout time (ISO 8601, including time zone)",
				visit.time_out ?? new Date().toISOString(),
			);
			if (!enteredTime) return;
			const time = new Date(enteredTime);
			if (Number.isNaN(time.getTime())) {
				setMessage("Enter a valid checkout time including its time zone.");
				return;
			}
			patch = { reason, time_out: time.toISOString() };
		}
		setBusy(true);
		setMessage("");
		try {
			const supabase = createClient();
			const endpoint = action === "notify" ? "send-host-email" : "reception-visit-action";
			const { error } = await supabase.functions.invoke(endpoint, {
				body:
					action === "notify"
						? { visit_id: visit.id }
						: { visit_id: visit.id, action, ...(patch ? { patch } : {}) },
			});
			if (error) throw error;
			if (action === "review") {
				const sent = await supabase.functions.invoke("send-host-email", {
					body: { visit_id: visit.id },
				});
				if (sent.error) setMessage("Review saved. Host email needs a retry.");
				else setMessage("Host notified.");
			} else setMessage("Visit updated.");
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["visit-queue", visit.location_id] }),
				queryClient.invalidateQueries({ queryKey: ["visit-queue-counts", visit.location_id] }),
				queryClient.invalidateQueries({ queryKey: ["visit-events", visit.id] }),
			]);
		} catch (cause) {
			setMessage(cause instanceof Error ? cause.message : "Action failed.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className={styles.actions}>
			{actions.map(({ label, action }) => (
				<button key={action} disabled={busy} onClick={() => void perform(action)}>
					{label}
				</button>
			))}
			{message && <span role="status">{message}</span>}
		</div>
	);
}
