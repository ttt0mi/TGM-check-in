"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth.module.css";

type InvitationPreview = {
	state: "active" | "invalid" | "expired" | "accepted" | "revoked" | "unavailable";
	organization_name?: string;
	invited_email?: string;
	invited_role?: "admin" | "receptionist";
	branch_name?: string | null;
	expires_at?: string;
};

export function AcceptInvite({ accountEmail }: { accountEmail: string }) {
	const router = useRouter();
	const [preview, setPreview] = useState<InvitationPreview | null>(null);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	async function loadPreview() {
		setLoading(true);
		setError("");
		try {
			const response = await fetch("/api/invitation/preview", { method: "POST" });
			if (!response.ok) throw new Error("Invitation details are temporarily unavailable. Retry.");
			setPreview((await response.json()) as InvitationPreview);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Unable to load invitation details.");
		} finally {
			setLoading(false);
		}
	}
	useEffect(() => {
		queueMicrotask(() => void loadPreview());
	}, []);

	async function accept() {
		if (preview?.state !== "active" || !matchesAccount) return;
		setBusy(true);
		setError("");
		try {
			const response = await fetch("/api/invitation/accept", { method: "POST" });
			if (!response.ok) {
				const body = (await response.json()) as { error?: string; code?: string };
				if (
					[
						"invitation_invalid",
						"invitation_expired",
						"invitation_used",
						"invitation_unavailable",
						"invitation_conflict",
					].includes(body.code ?? "")
				)
					await loadPreview();
				throw new Error(
					body.code === "invitation_wrong_email"
						? "Sign in with the invited email address shown above."
						: response.status >= 500
							? "Unable to reach the invitation service. Your invitation is saved; retry shortly."
							: (body.error ??
								"The invitation could not be accepted. Refresh its details or contact an administrator."),
				);
			}
			router.replace("/start");
			router.refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Unable to accept invitation.");
		} finally {
			setBusy(false);
		}
	}
	async function switchAccount() {
		await createClient().auth.signOut();
		router.replace("/login");
		router.refresh();
	}
	const matchesAccount = preview?.invited_email?.toLowerCase() === accountEmail.toLowerCase();
	return (
		<main id="main-content" className={styles.page}>
			<div className={styles.card}>
				<div className={styles.brand}>TGM</div>
				<h1>Join the organization</h1>
				{loading ? (
					<p role="status">Loading invitation details…</p>
				) : preview?.state === "active" ? (
					<>
						<p>Review the invitation before accepting.</p>
						<dl>
							<dt>Organization</dt>
							<dd>{preview.organization_name}</dd>
							<dt>Invited email</dt>
							<dd>{preview.invited_email}</dd>
							<dt>Role</dt>
							<dd>{preview.invited_role}</dd>
							{preview.branch_name && (
								<>
									<dt>Branch</dt>
									<dd>{preview.branch_name}</dd>
								</>
							)}
							<dt>Expires</dt>
							<dd>{preview.expires_at ? new Date(preview.expires_at).toLocaleString() : "Unknown"}</dd>
						</dl>
						{!matchesAccount && (
							<p role="alert">
								You are signed in as {accountEmail}. Sign in with {preview.invited_email} to accept this
								invitation.
							</p>
						)}
						<button disabled={busy || !matchesAccount} onClick={() => void accept()}>
							{busy ? "Joining…" : "Accept invitation"}
						</button>
						{!matchesAccount && (
							<button className={styles.secondary} onClick={() => void switchAccount()}>
								Switch account
							</button>
						)}
					</>
				) : preview ? (
					<p role="alert">
						{
							{
								invalid: "This invitation link is invalid.",
								expired: "This invitation has expired.",
								accepted: "This invitation has already been accepted.",
								revoked: "This invitation was revoked.",
								unavailable: "The invited organization or branch is unavailable.",
							}[preview.state]
						}
					</p>
				) : null}
				{error && <p role="alert">{error}</p>}
				{(!preview || preview.state !== "active") && (
					<button className={styles.secondary} disabled={loading} onClick={() => void loadPreview()}>
						Retry details
					</button>
				)}
			</div>
		</main>
	);
}
