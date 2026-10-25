"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInvite() {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	async function accept() {
		setBusy(true);
		setError("");
		try {
			const response = await fetch("/api/invitation/accept", {
				method: "POST",
			});
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				throw new Error(body.error || "Invitation unavailable");
			}
			router.replace("/start");
			router.refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Unable to accept invitation");
		} finally {
			setBusy(false);
		}
	}
	return (
		<main>
			<h1>Join the organization</h1>
			<p>Your verified email must match the invitation.</p>
			{error && <p role="alert">{error}</p>}
			<button disabled={busy} onClick={() => void accept()}>
				{busy ? "Joining…" : "Accept invitation"}
			</button>
		</main>
	);
}
