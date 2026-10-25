"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
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
	const [noticeCopy, setNoticeCopy] = useState(privacyNotice?.notice_copy ?? "");
	const [policyUrl, setPolicyUrl] = useState(privacyNotice?.policy_url ?? "");
	const [approved, setApproved] = useState(false);
	const [savingNotice, setSavingNotice] = useState(false);
	async function save(event: React.FormEvent) {
		event.preventDefault();
		const { error } = await createClient()
			.from("organizations")
			.update({ name: name.trim() })
			.eq("id", organization.id);
		setMessage(error ? error.message : "Organization name saved.");
		if (!error) onChanged();
	}
	async function saveNotice(event: React.FormEvent) {
		event.preventDefault();
		if (!approved) return;
		setSavingNotice(true);
		const { error } = await createClient().rpc("tgm_approve_privacy_notice", {
			p_organization_id: organization.id,
			p_notice_copy: noticeCopy.trim(),
			p_policy_url: policyUrl.trim(),
		});
		setMessage(
			error
				? "The privacy notice could not be approved. Check the copy and URL, then retry."
				: "Privacy notice approved for public check-in.",
		);
		if (!error) {
			setApproved(false);
			onChanged();
		}
		setSavingNotice(false);
	}
	return (
		<section className={styles.section}>
			<h2>Organization</h2>
			<form onSubmit={(event) => void save(event)} className={styles.form}>
				<label>
					Name{" "}
					<input maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} />
				</label>
				<button>Save name</button>
			</form>
			{message && <p role="status">{message}</p>}
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
