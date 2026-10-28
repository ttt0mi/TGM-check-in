"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { invokeFunction } from "@/lib/http/invoke-function";
import { postgrestError, RequestError } from "@/lib/http/request-error";
import { MUTATION_TIMEOUT_MS, withRequestTimeout } from "@/lib/http/timeout";
import { messageRole } from "@/features/shared/message-role";
import styles from "./admin.module.css";

export function OrganizationSettings({
	organization,
	privacyNotice,
	onChanged,
}: {
	organization: { id: string; name: string };
	privacyNotice: { notice_copy: string; policy_url: string; approved_at: string; approved_by: string } | null;
	onChanged: () => void;
}) {
	const [name, setName] = useState(organization.name);
	const [message, setMessage] = useState("");
	const [savingName, setSavingName] = useState(false);
	const [noticeCopy, setNoticeCopy] = useState(privacyNotice?.notice_copy ?? "");
	const [policyUrl, setPolicyUrl] = useState(privacyNotice?.policy_url ?? "");
	const [approved, setApproved] = useState(false);
	const [savingNotice, setSavingNotice] = useState(false);
	async function save(event: React.FormEvent) {
		event.preventDefault();
		if (!name.trim() || name.trim().length > 120) {
			setMessage("Enter an organization name of at most 120 characters.");
			return;
		}
		setSavingName(true);
		try {
			const { error } = await withRequestTimeout(
				async (signal) =>
					await createClient()
						.from("organizations")
						.update({ name: name.trim() })
						.eq("id", organization.id)
						.abortSignal(signal),
				MUTATION_TIMEOUT_MS,
			);
			if (error) throw postgrestError(error);
			try {
				onChanged();
				setMessage("Organization name saved.");
			} catch {
				setMessage("Name saved, but records could not be refreshed. Refresh the page before editing again.");
			}
		} catch (cause) {
			setMessage(
				cause instanceof RequestError ? cause.message : "The save outcome is unclear. Refresh before retrying.",
			);
		} finally {
			setSavingName(false);
		}
	}
	async function saveNotice(event: React.FormEvent) {
		event.preventDefault();
		if (!approved) return;
		setSavingNotice(true);
		try {
			await invokeFunction("approve-privacy-notice", {
				organization_id: organization.id,
				notice_copy: noticeCopy.trim(),
				policy_url: policyUrl.trim(),
			});
			setApproved(false);
			try {
				onChanged();
				setMessage("Privacy notice approved for public check-in.");
			} catch {
				setMessage("Notice approved, but records could not be refreshed. Refresh the page to confirm it.");
			}
		} catch (cause) {
			setMessage(
				cause instanceof RequestError ? cause.message : "Approval outcome is unclear. Refresh before retrying.",
			);
		} finally {
			setSavingNotice(false);
		}
	}
	return (
		<section className={styles.section}>
			<h2>Organization</h2>
			<p>Only the organization name and approved public privacy notice can be edited here.</p>
			<form onSubmit={(event) => void save(event)} className={styles.form}>
				<label>
					Name{" "}
					<input maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} />
				</label>
				<button disabled={savingName}>{savingName ? "Saving…" : "Save name"}</button>
			</form>
			{message && <p role={messageRole(message)}>{message}</p>}
			<h2>Public check-in privacy notice</h2>
			<p>
				Public check-in stays unavailable until an organization administrator approves notice copy and a full
				policy URL. Describe your own collection, purpose, visibility and retention policy.
			</p>
			{privacyNotice && (
				<p>
					Last approved {new Date(privacyNotice.approved_at).toLocaleString()} by an organization
					administrator.
				</p>
			)}
			<form onSubmit={(event) => void saveNotice(event)} className={styles.form}>
				<label>
					Visitor notice{" "}
					<textarea
						required
						minLength={40}
						maxLength={2000}
						rows={5}
						value={noticeCopy}
						onChange={(event) => setNoticeCopy(event.target.value)}
					/>
				</label>
				<label>
					Full privacy policy URL{" "}
					<input
						required
						type="url"
						pattern="https://.*"
						maxLength={2048}
						value={policyUrl}
						onChange={(event) => setPolicyUrl(event.target.value)}
					/>
				</label>
				<label>
					<input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />{" "}
					I am authorized to approve this notice for my organization.
				</label>
				<button disabled={!approved || savingNotice}>{savingNotice ? "Approving…" : "Approve notice"}</button>
			</form>
		</section>
	);
}
