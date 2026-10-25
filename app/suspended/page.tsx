"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import styles from "@/features/auth/auth.module.css";

export default function SuspendedPage() {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	async function signOut() {
		setBusy(true);
		const { error } = await createClient().auth.signOut();
		setBusy(false);
		if (error) {
			setMessage("Unable to sign out. Please try again.");
			return;
		}
		router.replace("/login");
		router.refresh();
	}
	return (
		<main className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brand}>TGM</div>
				<h1>Access suspended</h1>
				<p>
					Your account or organization is inactive. Contact an organization administrator or support to
					restore access.
				</p>
				{message && <p role="alert">{message}</p>}
				<button disabled={busy} onClick={() => void signOut()}>
					{busy ? "Signing out…" : "Sign out or switch account"}
				</button>
				<button
					className={styles.secondary}
					onClick={() => {
						router.replace("/start");
						router.refresh();
					}}
				>
					Retry access check
				</button>
			</div>
		</main>
	);
}
