"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth.module.css";

const schema = z.object({ name: z.string().trim().min(1).max(120) });
type Values = z.infer<typeof schema>;

export function CreateOrganization({ availability }: { availability: "open" | "disabled" | "error" }) {
	const router = useRouter();
	const form = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: { name: "" },
	});
	const [error, setError] = useState("");
	async function submit(values: Values) {
		setError("");
		const { error: failure } = await createClient().functions.invoke("register-organization", { body: values });
		if (failure) {
			setError(failure.message.includes("503") ? "Organization signup is not enabled yet." : failure.message);
			return;
		}
		router.replace("/start");
		router.refresh();
	}
	return (
		<main className={styles.page}>
			{availability !== "open" ? (
				<div className={styles.card}>
					<div className={styles.brand}>TGM</div>
					<h1>
						{availability === "error"
							? "Unable to check availability"
							: "Organization creation unavailable"}
					</h1>
					<p>
						{availability === "error"
							? "The signup service could not be reached. Retry shortly."
							: "Self-service organization creation is not available right now. Contact TGM support or your organization administrator."}
					</p>
					<button type="button" onClick={() => router.refresh()}>
						Retry availability check
					</button>
				</div>
			) : (
				<form className={styles.card} onSubmit={form.handleSubmit(submit)}>
					<div className={styles.brand}>TGM</div>
					<h1>Create your organization</h1>
					<p>You will be its first administrator.</p>
					<label>
						Organization name <input {...form.register("name")} />
					</label>
					{form.formState.errors.name && <small role="alert">Enter a name of up to 120 characters.</small>}
					{error && <p role="alert">{error}</p>}
					<button disabled={form.formState.isSubmitting}>Create organization</button>
				</form>
			)}
		</main>
	);
}
