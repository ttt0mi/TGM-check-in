"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { RequestError } from "@/lib/http/request-error";

export function RecoveryLink() {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	async function continueRecovery() {
		const fragment = new URLSearchParams(window.location.hash.slice(1));
		const tokenHash = fragment.get("token_hash");
		if (fragment.get("type") !== "recovery" || !tokenHash) {
			setError("This recovery link is incomplete. Request a new one.");
			return;
		}
		setBusy(true);
		setError("");
		try {
			const response = await fetchWithTimeout("/api/auth/recover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token_hash: tokenHash }),
			});
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				throw new Error(
					response.status === 410
						? "This recovery link is invalid or expired. Request a new one."
						: body.error === "auth_timeout"
							? "Verification may have succeeded. Reopen this link or try signing in before requesting another."
							: "Unable to verify this link. Please try again.",
				);
			}
			if (mounted.current) {
				window.history.replaceState(null, "", window.location.pathname);
				router.replace("/reset-password");
				router.refresh();
			}
		} catch (cause) {
			if (mounted.current)
				setError(
					cause instanceof RequestError && cause.kind === "timeout"
						? "Verification may have succeeded. Reopen this link or try signing in before requesting another."
						: cause instanceof Error
							? cause.message
							: "Unable to verify this link.",
				);
		} finally {
			if (mounted.current) setBusy(false);
		}
	}
	return (
		<main id="main-content" className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brand}>TGM</div>
				<h1>Confirm password recovery</h1>
				<p>Continue to verify your link and choose a new password. This link is used only when you continue.</p>
				{error && <p role="alert">{error}</p>}
				<button disabled={busy} onClick={() => void continueRecovery()}>
					{busy ? "Verifying…" : "Continue"}
				</button>
				<a href="/forgot-password">Request a new link</a>
			</div>
		</main>
	);
}
