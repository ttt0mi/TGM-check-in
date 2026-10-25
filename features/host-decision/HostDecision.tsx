"use client";

import { useEffect, useState } from "react";
import { respondToHostVisit } from "@/features/public-check-in/api";
import styles from "@/features/public-check-in/public-check-in.module.css";

export function HostDecision() {
	const [token, setToken] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		const fragment = new URLSearchParams(window.location.hash.slice(1));
		const value = fragment.get("token") ?? "";
		// The fragment is available only after hydration and is removed immediately.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (value) setToken(/^[a-f0-9]{64}$/i.test(value) ? value : "");
		window.history.replaceState(null, "", window.location.pathname);
	}, []);

	async function decide(outcome: "approved" | "declined") {
		setBusy(true);
		try {
			const result = await respondToHostVisit(token, outcome);
			setMessage(
				result.requires_reception_admission
					? "Approved. Reception will admit the visitor."
					: "The visit was declined.",
			);
			setToken("");
		} catch (cause) {
			setMessage(cause instanceof Error ? cause.message : "Unable to record your decision.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brand}>
					TGM <span>Host decision</span>
				</div>
				<h1>Visitor request</h1>
				{token ? (
					<>
						<p>Choose whether to welcome this visitor. Reception completes admission after approval.</p>
						<div className={styles.actions}>
							<button disabled={busy} onClick={() => void decide("approved")}>
								Approve visit
							</button>
							<button disabled={busy} onClick={() => void decide("declined")}>
								Decline visit
							</button>
						</div>
					</>
				) : (
					<p role="status">{message || "This decision link is invalid or has already been opened."}</p>
				)}
				{token && message && <p role="alert">{message}</p>}
			</div>
		</main>
	);
}
