"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

export function OrganizationSettings({
	organization,
	onChanged,
}: {
	organization: { id: string; name: string };
	onChanged: () => void;
}) {
	const [name, setName] = useState(organization.name);
	const [message, setMessage] = useState("");
	async function save(event: React.FormEvent) {
		event.preventDefault();
		const { error } = await createClient()
			.from("organizations")
			.update({ name: name.trim() })
			.eq("id", organization.id);
		setMessage(error ? error.message : "Organization name saved.");
		if (!error) onChanged();
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
		</section>
	);
}
